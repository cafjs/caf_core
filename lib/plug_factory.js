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
 *  A factory to create new CAs.
 *
 * @name plug_factory
 * @namespace
 * @augments gen_plug
 *
 */
var async = require('async');
var genPlug = require('./gen_plug');
var main = require('./main');

/*
 * File name containing the CA spec
 */
var __ca_json = 'ca.json';

/*
 * Class with custom methods in exports.methods
 */
var __ca_methods = 'ca_methods.js';

/*
 * Class with default methods in exports.methods
 */
var __ca_default_methods = 'ca_default_methods.js';


/**
 * Factory method to create a factory of CAs.
 *
 * @see sup_main
 */
exports.newInstance = function(context, spec, secrets, cb) {
    var $ = context;
    var that = genPlug.constructor(spec, secrets);

    $.log && $.log.debug('New CA factory plug');

    var caSpec = $.loader.load(spec[__ca_json] || __ca_json);
    var methods = $.loader.load(spec[__ca_methods] || __ca_methods).methods;
    var defaultMethods = $.loader.load(spec[__ca_default_methods] ||
                                       __ca_default_methods).methods;
    // {caId{string} : Queue}
    var createQ = {};

    /**
     * Gets a map with the application CA methods.
     *
     * @return {Object} A map with CA custom methods.
     *
     * @name plug_factory#getMethods
     * @function
     */
    that.getMethods = function() {
        return methods;
    };

    /**
     * Gets a map with default implementations of CA methods.
     *
     * @return {Object} A map with CA default methods.
     *
     * @name plug_factory#getDefaultMethods
     * @function
     */
    that.getDefaultMethods = function() {
        return defaultMethods;
    };


    var newQueue = function() {
        return async
            .queue(function(req, cb0) {
                       var caId = req.caId;
                       var env = req.env;
                       var result;
                       async.waterfall([function(cb1) {
                                            result = $.lookup.find(caId);
                                            if (result) {
                                                cb1(null, result);
                                            } else {
                                                caSpec.name = caId;
                                                main.loadComponent(caSpec,
                                                                   $, env,
                                                                   secrets,
                                                                   true, cb1);
                                            }
                                        }
                                       ], function(error, ca) {
                                           if (error) {
                                               cb0(error);
                                           } else {
                                               if (!result) {
                                                   $.lookup.add(caId, ca);
                                               }
                                               cb0(error, ca);
                                           }
                                       });
                   }, 1); // Sequential
    };

    var getQueue = function(caId) {
        var result = createQ[caId];
        if (!result) {
            result = newQueue();
            createQ[caId] = result;
        }
        return result;
    };

    /**
     *  Creates a CA or finds a reference to an existing local one
     * given the CA's id.
     *
     * If there is already a remote CA with the same id, it returns an
     * error object in the callback with the remote hosting node or a null
     * object if it is missing but we are not allowed to create one.
     *
     * @param {string} caId  An identifier for the CA.
     * @param {Object} env A set of properties to configure the new CA. Note
     * that 'env' is ignored if the CA has already been created.
     * @param {boolean} allowCreate Whether we can create missing CAs.
     * @param {function((Object | {remoteNode:string})=, Object=)} cb0 A
     * callback returning an error (first argument) that could describe a
     * remote location for the CA (or null location if we cannot create it)
     * or a (second argument) with the CA.
     *
     * @name plug_factory#instance
     * @function
     */
    that.instance = function(caId, env, allowCreate, cb0) {
        var result = $.lookup.find(caId);
        if (result) {
            if (result.isShutdown) {
                $.lookup.remove(caId);
                that.instance(caId, env, cb0);
            } else {
                cb0(null, result);
            }
        } else {
            /* __ca_init__ and __ca_resume__ are now first class methods
             * and they checkpoint and commit changes like any other message
             * invocation. For this reason, it is no longer acceptable to allow
             * race conditions during creation (and then shutdown unnecessary
             * CAs). To fix this issue we are serializing CA creation
             *  using multiple queues and mapping CAs to queues based on caIds.
             *
             * TO DO: need to allow empty queues to be GC when, e.g., the
             * lease is owned by a different node.
             *
             */
            async.waterfall([
                                function(cb1) {
                                    $.lease.grabLease(caId, cb1);
                                },
                                function(ignore, cb1) {
                                    if (allowCreate) {
                                        getQueue(caId).push({caId: caId,
                                                             env: env}, cb1);
                                    } else {
                                        // not there, can't create one.
                                        cb1({remoteNode: null}, null);
                                    }
                                }
                            ], cb0);
        }
    };

    var super_shutdown = that.superior('shutdown');
    /**
     * Shutdowns all the CAs created by this factory
     */
    that.shutdown = function(ctx, cb0) {
        var iterF = function(caTuple, cb1) {
            ctx.lookup.remove(caTuple.key);
            caTuple.value.shutdown(ctx, cb1);
        };
        var cb2 = function(err) {
            if (err) {
                cb0(err);
            } else {
                super_shutdown(ctx, cb0);
            }
        };
        // children shutdowns in parallel
        ctx.lookup.forEachAsync(iterF, cb2);
    };

    cb(null, that);

};
