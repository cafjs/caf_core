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
 * A plug to an external service to maintain leases on CAs.
 *
 * A lease protects a binding between a CA id and a location. This
 * binding can only be changed by the owner of the lease, avoiding
 * duplication of CAs across the data center.
 *
 * If the node owning the lease crashes, the lease eventually expires.
 * At that point a different, randomly
 * picked  node can grab a new lease and recreate the CA safely.
 *
 *
 * @name plug_lease
 * @namespace
 * @augments gen_plug
 */

var async = require('async');
var genPlug = require('./gen_plug');


/**
 * Factory method to create a lease plugin.
 *
 * @see sup_main
 */
exports.newInstance = function(context, spec, secrets, cb) {
    var $ = context;
    var that = genPlug.constructor(spec, secrets);
    /* Time in seconds before a new lease expires.*/
    var leaseTimeout = spec.env.leaseTimeout;

    $.log && $.log.debug('New lease plug');

    /**
     * Grabs a lease that guarantees exclusive ownership of a CA by this node.
     *
     *
     * @param {string} id  An identifier for the CA.
     * @param {function({remoteNode:string})} cb0 A callback with optional
     * (error) argument containing the current owner if we fail to acquire
     * the lease. Null error argument and empty array data if we succeeded.
     *
     * @name plug_lease#grabLease
     * @function
     */
    that.grabLease = function(id, cb0) {
        $.cp.grabLease(id, leaseTimeout, cb0);
    };


    /**
     * Renews a list of leases currently owned by this node.
     *
     * @param {Array.<string>} ids A list of identifiers for local CAs.
     * @param {function(Object, Array.<string>)} cb0 A callback with either
     * an error (first) argument or a (second) argument with a list of CA Ids
     *  that we failed to renew.
     *
     * @name plug_lease#renewLeases
     * @function
     */
    that.renewLeases = function(ids,  cb0) {
        if (ids.length === 0) {
            cb0(null, []);
        } else {
            $.cp.renewLeases(ids, leaseTimeout, cb0);
        }
    };

    cb(null, that);
};
