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
 * A top-level component that assembles and manages one Cloud Assistant
 * using components described in `ca.json`.
 *
 * CA components can be:
 *
 * - *Internal:* Stateful plugs, private to this CA,  that interact
 *  with framework-level plugs (which aggregate requests from multiple CAs).
 *
 * - *Proxies:* Stateless, paired with an internal plug,  they facilitate
 *    secure multi-tenancy by narrowing interfaces visible to
 *    application code.
 *
 * - *Handler:* A wrapper object for the state, proxies, and methods of your
 *    application.
 *
 * Internal plugs are created first, then proxies, and finally we
 * assemble the handler using the methods provided by your
 * application and the proxies. Shutdown reverses this
 * order. Moreover, in  case of
 * a framework shutdown, CAF first shutdowns all the CAs, and then
 * continues with the framework components.
 *
 *
 * @name ca_main
 * @namespace
 * @augments gen_ca
 */

var async = require('async');
var genCA = require('./gen_ca');
var myutils = require('./myutils');
var json_rpc = require('./json_rpc');

/**
 * Factory method to create a top-level CA component.
 *
 * Do not call this method directly, use `instance()` in the `fact`
 * service (`plug_factory`) to avoid duplicates and register
 * CAs properly.
 *
 * @see sup_main
 */
exports.newInstance = function(context, spec, secrets, cb) {

    var $ = context;
    var that = genCA.constructor(spec, secrets);

    /* We pass the local context as a secret to facilitate the wiring
     *  of proxies with internal plugs. The idea is that after the wiring
     * this local context should not be available as a property in any of them
     * and all needed dependencies are encapsulated in closures.
     */
    secrets = that.$;
    secrets.myId = that.getName();

    var childrenSpecs = myutils.flatten([spec.internal, spec.proxies,
                                         spec.handler]);
    async.waterfall(
        [
            function(cb0) {
                that.createChildren(childrenSpecs, $, spec.env, secrets, false,
                                    cb0);
            },
            function(data, cb0) {
                $.cp.getState(that.getName(), cb0);
            },
            function(data, cb0) {
                if (typeof data === 'string') {
                    that.resume(data, cb0);
                } else {
                    that.init(cb0);
                }
            },
            function(data, cb0) {
                var msg = json_rpc.request(json_rpc.SYSTEM_TOKEN,
                                           that.getName(),
                                           json_rpc.SYSTEM_FROM,
                                           json_rpc.SYSTEM_SESSION_ID,
                                           '__ca_first_message__');
                that.process(msg, cb0);
            }
        ],
        function(err, data) {
            if (err) {
                $.log && $.log.debug('Cannot create CA' + err);
                cb(err);
            } else {
                /* Do not register in context here, calling factory does
                 * registration in lookup service.*/
                cb(err, that);
            }
        });
};


