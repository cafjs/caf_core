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
 * Generic plug with a redis connection
 *
 * @name gen_redis_plug
 * @namespace
 * @augments gen_plug
 *
 */

var redis = require('redis');
var async = require('async');
var genPlug = require('./gen_plug');
var genCron = require('./gen_cron');

/**
 * Constructor method for a generic  plug with a redis connection.
 *
 * @see gen_component
 *
 */
exports.constructor = function(spec, secrets) {

    var that = genPlug.constructor(spec, secrets);

    /**
     * Run-time type information.
     *
     * @type {boolean}
     * @name gen_redis_plug#isRedis
     */
    that.isRedis = true;

    var clientRedis;
    var luaHashes = {};

    /* config type is {password: <string>, hostname: <string>,
     port: <integer>}.*/
    var config = spec && spec.env && spec.env.redis;

    /**
     * Gets a connection to Redis.
     *
     * @return {Object} A connection to Redis.
     * @name gen_redis_plug#getClientRedis
     * @function
     */
    that.getClientRedis = function() {
        return clientRedis;
    };

    /**
     * Sends a LUA command to Redis.
     *
     * @param {string} op Operation to perform.
     * @param {Array.<string>} ids CA identifiers.
     * @param {Array.<Object>} argsList Arguments to LUA command.
     * @param {caf.cb} cb A callback called with the response to the LUA command.
     *
     * @name gen_redis_plug#doLuaOp
     * @function
     */
    that.doLuaOp = function(op , ids, argsList, cb) {
        var args = [luaHashes[op], ids.length]
            .concat(ids)
            .concat(argsList);
        clientRedis.send_command('evalsha', args, cb);
    };

    var registerScripts = function(all, cb) {
        var seriesF = {};
        var newF = function(script) {
            return function(cb1) {
                clientRedis.send_command('SCRIPT', ['LOAD', script], cb1);
            };
        };
        for (var scriptName in all) {
            seriesF[scriptName] = newF(all[scriptName]);
        }
        // We could use parallel but series is easier to debug and performance
        // is not an issue.
        async.series(seriesF, cb);
    };


// caf.service type is {port: number, hostname: string, password: string}
    /**
     * Initializes the Redis connection/LUA scripts.
     *
     * @param {Object} context A context used to register this plug.
     * @param {caf.service} optConfig hostname/port/password for redis
     * service. Info in description (spec.env) has priority.
     * @param {Object.<string, string>} lua A map with script names
     * (keys) and LUA script source codes (values).
     * @param {caf.cb} cb A callback to continue after initialization.
     *
     * @name gen_redis_plug#initClient
     * @function
     */
    that.initClient = function(context, optConfig, lua, cb) {
        var $ = context;
        // spec.env description has priority
        config = config || optConfig;
        clientRedis = redis.createClient(config.port, config.hostname);
        clientRedis.on('error',
                       function(err) {
                           $.log && $.log.error('Redis connection error to ' +
                                                JSON.stringify(config) + ' ' +
                                                err);
                           /* Current policy with disconnects is proper
                            shutdown by calling sup callback with error and
                            then, if we are still alive, the retry mechanism
                            will trigger a end() that eventually shuts down the
                            process with a connect refused exception.
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
        async.series([
                         function(cb0) {
                             clientRedis.auth(config.password, cb0);
                         },
                         function(cb0) {
                             var cb1 = function(err, hashes) {
                                 if (err) {
                                     cb0(err);
                                 } else {
                                     luaHashes = hashes;
                                     cb0(err, hashes);
                                 }
                             };
                             registerScripts(lua, cb1);
                         }
                     ],
                     function(err, ignore) {
                         if (err) {
                             $.log && $.log.error('Fatal redis init error');
                             that.shutdown($, function(null_error, sameThat) {
                                               cb(err, that);
                                           });
                         } else {
                             cb(null, that);
                         }
                     });
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
    return that;
};
