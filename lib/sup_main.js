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
 * A top level  supervisor component that assembles and manages the
 * framework from simpler components as described in `framework.json`.
 *
 * Framework components can be:
 *
 * -  *Plugs:*  Interfaces to passive sub-systems that could be external to this
 * node.js instance or a local service (possibly implemented by the
 * plug itself).
 *
 * - *Crons:*  Implement periodic, bookkeeping tasks for CAs.
 *
 * - *Pipe:* Main processing pipeline that traces a message through the system
 * until it gets delegated to a CA.
 *
 *  Note that CAs are also assembled from a JSON description,
 * `ca.json`, see `ca_main.js` for details.
 *
 * Descriptions of plugs and crons are contained in an array that
 * specifies initialization order. Plugs are initialized first, then
 * crons, and finally the pipe. List order is
 * strictly maintained during initialization and if an step fails
 * the process aborts. Shutdown is always in the reverse other.
 *
 * A component description has three properties:
 *
 * - *module* Defines where to find the implementation of the component.
 *
 * - *name*  Specifies the name that should be used when we register the
 * (framework) component in the top level context.
 *
 * - *env* Property set with configuration data for this component.
 *
 * By convention every component's module provides a factory method
 * `newInstance()`, and the resulting component has a `shutdown()` method.
 *
 *
 * @name sup_main
 * @namespace
 * @augments gen_supervisor
 */

var async = require('async');

var genSupervisor = require('./gen_supervisor');
var myutils = require('./myutils');

/**
 * Factory method to create a top-level supervisor component.
 *
 * @param {Object} context A framework-level context to register or
 * lookup components by name.
 * @param {{module: string, name: string, env: Object}} spec Property
 * set to configure this object.
 * @param {Object} secrets A map with run-time information that should be
 * encapsulated within the new component methods.
 * @param {caf.cb} cb A callback funtion to return the new component
 * or propagate an error.
 */
exports.newInstance = function(context, spec, secrets, cb) {

    var that = genSupervisor.constructor(spec, secrets);

    if (spec.env && spec.env['debugger']) {
        // activate debugger
        process.kill(process.pid, 'SIGUSR1');
    }

    var childrenSpecs = myutils.flatten([spec.plugs, spec.crons, spec.pipe]);


    var newCb = function(err, sameThat) {
        if (err) {
            cb(err);
        } else {
            that.register(context);
            cb(err, that);
        }

    };

    /*
     * The global context for this framework instance.
     *
     * @type {Object}
     * @name sup_main#$
     */ 
    that.$ = context;


    that.createChildren(childrenSpecs, that.$, spec.env, secrets, false, newCb);
};
