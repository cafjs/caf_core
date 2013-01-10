/*!
Copyright 2013 Hewlett-Packard Development Company, L.P.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
"use strict";
/**
 * A plug object to access an external checkpointing service that supports
 * LUA scripting.
 *
 * This is a replacement module for `plug_checkpoint` when the redis server
 * is version >=2.6.  The goal is to enable full pipelining of requests
 * while still guaranteeing  ownership of leases during operations. This is not
 * possible in  `plug_checkpoint` because 'redis transactions' do not nest over
 * a single session. However, in >=2.6 we can submit Lua scripts that are
 * guaranteed to execute atomically and this will save a roundtrip by
 * combining the check and the operation in the same script.
 *
 * We also implement coalescing of state updates across different CAs.
 * The rationale is that we can amortize the setup cost of lua with several
 * updates. This improves dramatically redis throughput and also reduces
 * client overhead. The penalty is an increase of latency when the system is
 * not under heavy load, and we need a cron to bound that increase in
 * latency. Typical coalescing config  values for a fast server are a maximum
 * of 10 requests or 10 extra msec. Note that cron scheduling is not very
 * accurate under load, and that's why we also need a limit on #requests.
 *
 * A configuration example in framework.json (plugs section) is as follows:
 *
 *       {
 *           "module": "plug_checkpoint_lua",
 *           "name": "cp",
 *           "env": {
 *               "coalescing" : {
 *                   "interval" : 0.01,
 *                   "maxPendingUpdates" : 10
 *               }
 *           }
 *       }
 *
 * @name plug_checkpoint_lua
 * @namespace
 * @augments gen_redis_plug
 */

var assert = require('assert');
var redis = require('redis');
var async = require('async');
var crypto = require('crypto');

var genRedisPlug = require('./gen_redis_plug');

var genCron = require('./gen_cron');

var luaPreamble = 'local owners = redis.call("mget", unpack(KEYS)) \
local data = {} \
for i =1, #KEYS, 1 do \
   if owners[i] ~= ARGV[1] then \
      local owner = owners[i] or "nobody"\
      return { err = KEYS[i] .. " is owned by " ..  owner .. " not " .. ARGV[1]} \
   else \
      data[i] = "data:" .. KEYS[i]\
   end \
end ';

/*
 * Bulk update of CA states. It returns an error (without doing any changes)
 * if any of the CAs are not owned by this node.
 *
 * KEYS is an array with all the CA ids
 * ARGV[1] is the local nodeId
 * ARGV[i+1] for i=1, #KEYS is the new states for those CAs
 *
 */
var luaUpdateState = luaPreamble +
'local mixed = {} \
if (#data ~= (#ARGV -1)) then \
   return { err = "wrong number of arguments" .. (#ARGV -1) " instead of " .. #data} \
end \
for i =1, #data, 1 do \
   mixed[2*i-1] = data[i] \
   mixed[2*i] = ARGV[i+1] \
end \
return redis.call("mset", unpack(mixed))';

/*
 * Bulk delete of CA states. It returns an error (without doing any changes)
 * if any of the CAs are not owned by this node.
 *
 * KEYS is an array with all the CA ids
 * ARGV[1] is the local nodeId
 */
var luaDeleteState = luaPreamble + 'return  redis.call("del", unpack(data))';

/*
 * Bulk query of states. It returns an error (without doing any changes)
 * if any of the CAs are not owned by this node.
 *
 * KEYS is an array with all the CA ids
 * ARGV[1] is the local nodeId
 *
 * returns an array of string representing CA states
 *
 */
var luaGetState = luaPreamble + 'return  redis.call("mget", unpack(data))';

/*
 * Grabs leases for a set of CAs.
 *
 * KEYS is an array with all the CA ids
 * ARGV[1] is the local nodeId
 * ARGV[2] is the timeout in seconds
 *
 * Returns an array of size #KEYS with false entries for sucessfull lease grabs
 * and a remote owner (string)  for the others.
 */
var luaGrabLease = 'local owners = redis.call("mget", unpack(KEYS)) \
local leases = {} \
for i =1, #KEYS, 1 do \
   if not owners[i] then \
      redis.call("set", KEYS[i], ARGV[1]) \
      redis.call("expire", KEYS[i], tonumber(ARGV[2])) \
      table.insert(leases, false) \
   elseif  owners[i] == ARGV[1] then \
      table.insert(leases, false) \
   else \
      table.insert(leases, owners[i]); \
   end \
end \
return leases';



/*
 *  Bulk renewal of leases associated to CAs.
 *
 *   KEYS is an array with all the CA ids
 * ARGV[1] is the local nodeId
 * ARGV[2] is the timeout in seconds
 *
 * Returns an array with all the keys corresponding to CAs that we failed to
 *  renew.
 *
 */
var luaRenewLeases =
'local owners = redis.call("mget", unpack(KEYS)) \
local gone = {} \
for i =1, #KEYS, 1 do \
   if owners[i] ~= ARGV[1] then \
      table.insert(gone, KEYS[i]) \
   else \
      redis.call("expire", KEYS[i], tonumber(ARGV[2])) \
   end \
end \
return gone';

var luaAll = {
    updateState: luaUpdateState,
    deleteState: luaDeleteState,
    getState: luaGetState,
    grabLease: luaGrabLease,
    renewLeases: luaRenewLeases
};


/**
 * Factory method to create a checkpointing service connector.
 *
 *  @see sup_main
 */
exports.newInstance = function(context, spec, secrets, cb) {


    var $ = context;
    $.log && $.log.debug('New CP plug');
    if ($.log && $.log.isActive('TRACE')) {
        redis.debug_mode = true;
    }
    var that = genRedisPlug.constructor(spec, secrets);

    var maxPendingUpdates = (spec && spec.env && spec.env.coalescing &&
        spec.env.coalescing.maxPendingUpdates) || 1;
    var pendingUpdates = [];

    var newUpdateCron = function(config) {
        var cron = genCron.constructor({env: config}, {});
        cron.start(function() {flushUpdateState(true);});
        return cron;
    };
    var updateCron = (maxPendingUpdates !== 1) &&
        newUpdateCron(spec.env.coalescing);

    var doLua = function(op , ids, argsList, cb0) {
        assert.ok($.uniquifier.getNodeId(), 'Error: Operation ' + op +
                  ' without a nodeId');
        assert.ok(!that.isShutdown, 'Error: Operation ' + op +
                  ' with a shutdown plug cp');
        that.doLuaOp(op, ids, [$.uniquifier.getNodeId()].concat(argsList), cb0);
    };

    var oneUpdateState = function(id, newValue,  cb0) {
        doLua('updateState', [id], [newValue], cb0);
    };

    var oneUpdateStateF = function(id, newValue, cb0) {
      return function() {
          oneUpdateState(id, newValue, cb0);
      };
    };

    var flushUpdateState = function(force) {
        if ((pendingUpdates.length >= maxPendingUpdates) ||
            (force && pendingUpdates.length > 0)) {
            var ids = [], values = [], cbs = [];
            pendingUpdates.forEach(function(x) {
                                       ids.push(x.id);
                                       values.push(x.value);
                                       cbs.push(x.cb);
                                   });
            var cb1 = function(err, responses) {
                if (err) {
                    // retry separately
                    for (var i = 0; i < ids.length; i++) {
                        process.nextTick(oneUpdateStateF(ids[i], values[i],
                                                         cbs[i]));
                    }
                } else {
                    cbs.forEach(function(cbx) {
                                    process.nextTick(function() {
                                                         cbx(err, responses);
                                                     });
                                });
                }
            };
            pendingUpdates = [];
            doLua('updateState', ids, values, cb1);
        }
    };

    /**
     * Updates the state of a CA in the checkpointing service.
     *
     * @param {string} id An identifier for the CA.
     * @param {string} newValue A serialized new state for this CA.
     * @param {caf.cb} cb0 A callback to notify of an error updating
     * or succesful completion if falsy argument.
     *
     * @name plug_checkpoint_lua#updateState
     * @function
     */
    that.updateState = function(id, newValue,  cb0) {
        if (maxPendingUpdates === 1) {
            oneUpdateState(id, newValue, cb0);
        } else {
            pendingUpdates.push({id: id, value: newValue, cb: cb0});
            flushUpdateState();
        }
    };

    /**
     * Removes the state of a CA in the checkpointing service.
     *
     * @param {string} id An identifier for the CA.
     * @param {caf.cb} cb0 A callback to notify an error deleting
     * or its succesful completion if the argument is a falsy.
     *
     * @name plug_checkpoint_lua#deleteState
     * @function
     *
     */
    that.deleteState = function(id,  cb0) {
        doLua('deleteState', [id], [], cb0);
    };

    /**
     * Gets the state of a  CA from the checkpointing service.
     *
     * Note that only the current (lease) owner can read this state.
     *
     *
     * @param {string} id An identifier for the CA.
     * @param {function(Object=, string=)} cb0 A callback to notify an error
     * getting the state or (in a second argument) the serialized state of that
     * CA.
     *
     * @name plug_checkpoint_lua#getState
     * @function
     */
    that.getState = function(id,  cb0) {
        var cb1 = function(err, data) {
            if (err) {
                cb0(err, data);
            } else {
                cb0(err, data[0]);
            }
        };
        doLua('getState', [id], [], cb1);
    };

    /**
     * Grabs a lease that guarantees exclusive ownership of a CA by this node.
     *
     * @param {string} id An identifier for the CA.
     * @param {number} leaseTimeout Duration of the lease in seconds.
     * @param {function({remoteNode:string})} cb0 A callback with optional
     * (error) argument containing the current owner if we fail to acquire
     * the lease. Null error argument and empty array data if we succeeded.
     *
     * @name plug_checkpoint_lua#grabLease
     * @function
     */
    that.grabLease = function(id, leaseTimeout, cb0) {
        var cb1 = function(err, remote) {
            if (err) {
                // not owned by me due to error
                cb0(err, remote);
            } else {
                if (remote && (typeof remote[0] === 'string')) {
                    // not owned by me because already owned by someone else
                    cb0({remoteNode: remote[0]});
                } else {
                    // got it
                    cb0(null, remote);
                }
            }
        };
        doLua('grabLease', [id], [leaseTimeout], cb1);
    };

    /**
     * Renews a list of leases currently owned by this node.
     *
     * @param {Array.<string>} ids A list of identifiers for local CAs.
     * @param {number} leaseTimeout Duration of the lease in seconds.
     * @param {function(Object, Array.<string>)} cb0 A callback with either
     * an error (first) argument or a (second) argument with a list of CA Ids
     *  that we failed to renew.
     *
     * @name plug_checkpoint_lua#renewLeases
     * @function
     */
    that.renewLeases = function(ids, leaseTimeout, cb0) {
        assert.ok(ids.length < 8000, 'LUA unpack limited to 8000, need to fix');
        doLua('renewLeases', ids, [leaseTimeout], cb0);
    };


    var super_shutdown = that.superior('shutdown');
    that.shutdown = function(ctx, cb0) {
        if (that.isShutdown) {
            // do nothing, return OK
            cb0(null, that);
        } else {
            updateCron && updateCron.stop();
            super_shutdown(ctx, cb0);
        }

    };

    that.initClient($, $.cf.getServiceConfig('redis'), luaAll, cb);
};
