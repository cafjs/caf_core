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
 * A plug object to access an external checkpointing service.
 *
 * This component is DEPRECATED. Use `plug_checkpoint_lua` with redis >=2.6
 *
 * @name plug_checkpoint
 * @namespace
 * @augments gen_plug
 */

var assert = require('assert');
var redis = require('redis');
var async = require('async');

var genPlug = require('./gen_plug');


/*
 * A CASTaskExecutor is an event loop that ensures that changes
 * to redis are properly serialized. For every CA we maintain a lease in
 * redis with a binding id -> <owner node>. Nodes renew leases regularly
 * and there is a single (or none) reader/writer node per key at all times.
 *  Redis deletes expired bindings enabling transparent recovery of failed
 * nodes.
 *
 * The critical mechanism to guarantee that is a generalized compare and swap
 * operation that ensures leases are not owned by other nodes before
 * commiting changes to redis.
 *
 * We do not force that the requesting node owns the leases at
 * commit time, we just ensure that it is the last owner. Since readers also
 * need an exclusive lease, nobody will observe the difference if the lease
 * expired just before commit.
 *
 * This weaker notion is needed because  expired keys do not fail transactions
 * in redis (i.e., using the WATCH command). Moreover, a more complex
 * readers/writer lock scheme is not needed because there is no data sharing
 * between CAs using this mechanism.
 *
 * Also, the assumption is that both the lease and all the changes are limited
 *  to one redis server (no distributed transactions). Note that this does not
 *  preclude sharding as long as the hashing scheme maps both the lease and
 * data of a CA to the same redis server. This could be implemented
 * with  hash tags, e.g., keys of the form  <whatever>'{'tag'}' and we only
 * use 'tag' during hashing.
 *
 * Redis 2.6 will introduce Lua scripting and this will enable full pipelining
 * with fewer roundtrips. In the meantime, since MULTI commands do not nest
 * we would need to use multiple redis connections to pipeline requests.
 *
 */
var newCASTaskExecutor = function(redisClient) {

    var queue =
        async.queue(function(task, cb) {
                        /* Later on exec() will fail if any key value is
                         * modified
                         *  - with the exception of expired keys deletion-
                         */
                        redisClient.watch(task.keys);
                        /* By creating a multi object just after watch we
                         * can detect a
                         * race condition because multi() will not nest.
                         * This race can only happen if redisClient is also used
                         * in a transactional way outside the CASTaskExecutor
                         * (not recommended!).
                         */
                        var multi = redisClient.multi();
                        async.waterfall(
                            [
                                //read current key values
                                function(cb0) {
                                    if (Array.isArray(task.keys) &&
                                        (task.keys.length > 0)) {
                                        redisClient.mget(task.keys, cb0);
                                    } else {
                                        cb0(null, []);
                                    }
                                },
                                //build transaction/abort based on current state
                                function(response, cb0) {
                                    task.op(multi, response, cb0);
                                },
                                // commit if watched keys did not change
                                function(cb0) {
                                    multi.exec(cb0);
                                }
                            ],
                            function(error, data) {
                                if (error) {
                                    // aborted transaction, clean up
                                    redisClient.unwatch();
                                }
                                cb(error, data);
                            });
                    }, 1); // sequential
    var that = {

        /** 'doIt' performs a series of updates atomically and conditional
         * to certain invariants over  key values holding during the
         * transaction.
         * Operations are serialized using an input queue. Each operation
         * first reads the values of a set of keys. Then, it calls a custom
         * function that creates an update transaction with those values (or
         * aborts using a callback if values do not respect the invariant).
         * Finally, we commit the changes if the values read have not been
         * modified (the exception is key deletion due to expiration that does
         *  not get detected, but this should not affect serializability in
         * our case).
         *
         *
         * @param keys is an array of bindings  that are needed for 'op'.
         *
         * @param op is a function of the form
         *       (multi, bindingsValues, callback) -> undefined
         *  where multi is just a redis transaction using the MULTI command
         *  bindingsValues is an array with the status of the bindings
         *  callback a function to commit or abort the transaction
         * Note that op should NOT call multi.exec()!
         *
         * @param cb is a callback to notify to the caller the success or
         * failure of the update.
         */
        'doIt' : function(keys,  op, cb) {
            queue.push({'keys' : keys, 'op' : op }, cb);
        },

        /**
         * A specialized form of 'doIt' that just checks that the lease of
         *  one or more CAs are still owned by this node.
         */
        'doItIfOwner' : function(ids, nodeId,  op, cb) {
            if (nodeId) {
                var idArray = (Array.isArray(ids) ? ids : [ids]);
                that.doIt(idArray,
                          function(multi, values, cb0) {
                              var checkF = function(x) {return (x === nodeId);};
                              if (values.every(checkF)) {
                                  op(multi, values, cb0);
                              } else {
                                  cb0('Error: doItIfOwner: no lease in ' + op +
                                      ' of ' + idArray + ' got ' + values +
                                      ' instead of ' + nodeId, values);
                              }
                          }, cb);
            } else {
                cb('Error: doItIfOwner: unknown nodeId');
            }
        }
    };


    return that;
};

/**
 * Factory method to create a checkpointing service connector.
 *
 * @see sup_main
 */
exports.newInstance = function(context, spec, secrets, cb) {


    var $ = context;
    $.log && $.log.debug('New CP plug');
    if ($.log && $.log.isActive('TRACE')) {
        redis.debug_mode = true;
    }
    var that = genPlug.constructor(spec, secrets);

    var config = $.cf.getServiceConfig('redis');

    var clientRedis = redis.createClient(config.port,
                                         config.hostname);

    var casTaskExecutor = newCASTaskExecutor(clientRedis);

    clientRedis.on('error', function(err) {
                       $.log && $.log.error('Fatal redis connection error to ' +
                                   JSON.stringify(config) + ' ' + err);
                       /* Current policy with disconnects is proper
                        shutdown by calling sup callback with error and then,
                        if we are still alive, the retry mechanism will
                        trigger a end() that eventually shuts down the process
                        with a connect refused exception.
                        For debugging we can disable the retry with
                         clientRedis.closing = true; and that will leave
                        the node process alive...

                        It may make better sense to retry for a while first
                        i.e., without shutdown, just in case is a hiccup of
                        redis. (i.e., count the number of retries)
                        */
                       if (that.isShutdown) {
                           // graceful shutdown did not work, use the hammer
                           clientRedis.closing = true; // do not retry
//                           clientRedis.end();
                       } else {
                           that.shutdown($, function(null_error, sameThat) {
                                             cb(err, sameThat);
                                         });
                       }
                   });

    var sanityCheck = function(msg) {
        assert.ok($.uniquifier.getNodeId(), 'Error:' + msg +
                  ' without a nodeId');
        assert.ok(!that.isShutdown, 'Error:' + msg +
                  ' with shutdown plug cp');
    };

    /**
     * Updates the state of a CA in the checkpointing service.
     *
     * @param {string} id An identifier for the CA.
     * @param {string} newValue A serialized new state for this CA.
     * @param {caf.cb} cb0 A callback to notify of an error updating
     * or succesful completion if falsy argument.
     *
     * @name plug_checkpoint#updateState
     * @function
     */
    that.updateState = function(id, newValue,  cb0) {

        sanityCheck('Updating state');
        casTaskExecutor.doItIfOwner(id, $.uniquifier.getNodeId(),
                                    function(multi, values, cb1) {
                                        multi.set('data:' + id, newValue);
                                        cb1(null); // commit
                                    }, cb0);
    };

    /**
     * Removes the state of a CA in the checkpointing service.
     *
     * @param {string} id An identifier for the CA.
     * @param {caf.cb} cb0 A callback to notify an error deleting
     * or its succesful completion if the argument is a falsy.
     *
     * @name plug_checkpoint#deleteState
     * @function
     *
     */
    that.deleteState = function(id,  cb0) {
        sanityCheck('Deleting state');
        casTaskExecutor.doItIfOwner(id, $.uniquifier.getNodeId(),
                                    function(multi, values, cb1) {
                                        multi.del('data:' + id);
                                        cb1(null); // commit
                                    }, cb0);
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
     * @name plug_checkpoint#getState
     * @function
     */
    that.getState = function(id,  cb0) {
        sanityCheck('Reading state');
        var cb1 = function(err, data) {
            if (err) {
                cb0(err, data);
            } else {
                cb0(err, data[0]);
            }
        };
        casTaskExecutor.doItIfOwner(id, $.uniquifier.getNodeId(),
                                    function(multi, values, cb2) {
                                        multi.get('data:' + id);
                                        cb2(null); // commit
                                    }, cb1);
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
     * @name plug_checkpoint#grabLease
     * @function
     */
    that.grabLease = function(id, leaseTimeout, cb0) {
        sanityCheck('Grabbing lease');
        var nodeId = $.uniquifier.getNodeId();
        casTaskExecutor.doIt([id],
                             function(multi, values, cb1) {
                                 if (values[0] === null) {
                                     multi.set(id, nodeId);
                                     multi.expire(id, leaseTimeout);
                                     cb1(null);
                                 } else if (values[0] === nodeId) {
                                   // do nothing, return ok
                                   cb1(null);
                               } else {
                                   // cannot get lease, return current owner
                                   cb1({remoteNode: values[0]});
                               }
                             }, cb0);

    };

    /**
     * Renews a list of leases currently owned by this node.
     *
     * @param {Array.<string>} ids A list of identifiers for local CAs.
     * @param {number} leaseTimeout Duration of the lease in seconds.
     * @param {function(Object, Array.<string>=)} cb0 A callback with either
     * an error (first) argument or a (second) argument with a list of CA Ids
     *  that we failed to renew.
     *
     * @name plug_checkpoint#renewLeases
     * @function
     */
      that.renewLeases = function(ids, leaseTimeout, cb0) {
        sanityCheck('Renewing leases');
        var gone = [];
        var alive = [];
        var nodeId = $.uniquifier.getNodeId();
        var cb1 = function(err, data) {
            if (err) {
                cb0(err);
            } else {
                // expired keys do not abort transaction in redis, need to check
                data.forEach(function(x, index) {
                                 if (x === 0) {
                                     gone.push(alive[index]);
                                 }
                             });
                cb0(null, gone);
            }
        };
        casTaskExecutor.doIt(ids, function(multi, values, cb2) {
                                 var f = function(node, index) {
                                     if (node === nodeId) {
                                         alive.push(ids[index]);
                                         multi.expire(ids[index], leaseTimeout);
                                     } else {
                                         gone.push(ids[index]);
                                     }
                                 };
                                 values.forEach(f);
                                 cb2(null); // commit
                             }, cb1);
    };


    var super_shutdown = that.superior('shutdown');
    that.shutdown = function(ctx, cb0) {
        if (that.isShutdown) {
            // do nothing, return OK
            cb0(null, that);
        } else {
            if (clientRedis) {
                /* this closes the connection gracefully, i.e., processing
                 all replies and sending QUIT command, but if it hangs
                 we may want to timeout and force an exit with end().
                 */
                clientRedis.quit();
            }
            super_shutdown(ctx, cb0);
        }

    };

    clientRedis.auth(config.password, function(err, data) {
                         if (err) {
                             $.log && $.log.error('Fatal redis authentication' +
                                                  ' error');
                             that.shutdown($, function(null_error, sameThat) {
                                 cb(err, sameThat);
                             });
                         } else {
                             cb(null, that);
                         }
                     });
};
