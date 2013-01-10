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
 * Generic container component that encapsulates the life-cycle of
 * other components.
 *
 * A container uses a description list to create child components,
 *  defines a new context to register them, and propagates shutdown
 *  actions to them when needed.
 *
 * Child creation order is based on description order (JSON array),
 * and a created child component is immediately visible in the
 * context. Also, even though creation is an asynchronous operation, CAF
 * serializes for each CA (or for the framework
 * itself) the creation of components. This means that a child component
 * can rely on other (child) components during its creation
 * as long as the listed order respects all the dependencies.
 *
 * During shutdown we serialize actions and reverse creation order to
 * avoid dangling references to other components.
 *
 * @name gen_container
 * @namespace
 * @augments gen_component
 */

var genComponent = require('./gen_component');
var async = require('async');
var main = require('./main');
var myutils = require('./myutils');


var doChildrenShutdown = function(components, context, cb) {

    var oneShutdown = function(component, cb0) {
        component.shutdown(context, cb0);
    };
    async.forEachSeries(components, oneShutdown, cb);
};

var doChildrenNewInstance = function(specs, context, parentContext, env,
                                     secrets, override, cb) {
    var oneNewInstance = function(spec, cb0) {
        var cb1 = function(err, comp) {
            if (err) {
                cb0(err);
            } else {
                comp.register(parentContext);
                cb0(err, comp);
            }
        };
        main.loadComponent(spec, context, env, secrets, override, cb1);
    };
    async.mapSeries(specs, oneNewInstance, cb);
};

/**
 * Constructor method for a generic container component.
 *
 * @see gen_component
 *
 */
exports.constructor = function(spec, secrets) {

    var that = genComponent.constructor(spec, secrets);
    var children = [];

    /**
     * A context to register children.
     *
     * @type {Object}
     * @name gen_container#$
     */
    that.$ = that.$ || {};

    /**
     * Creates children from an spec and registers them with this container.
     *
     * @param {Array.<Object>} childSpecs Read-only configuration data
     * for the children of this container.
     * @param {Object} context A global context with extra
     * components that children may need during creation.
     * @param {Object} env Property map with global configuration data
     * to be mixed-in before creation with the children' `env` in `childSpecs`.
     * @param {Objects} secrets Context with run-time information that
     * should be encapsulated within children methods.
     * @param {boolean} override If true,  when there is a conflict
     * because a property has been defined in both the global `env` and
     * the corresponding  `childSpecs' env`, the global `env` has
     * priority. Otherwise, the child spec definition prevails. If
     * there are no conflicts we always mix-in.
     * @param {caf.cb} cb A callback to continue after child creation.
     *
     * @name gen_container#createChildren
     * @function
     *
     */
    that.createChildren = function(childSpecs, context, env,
                                   secrets, override, cb) {
        var cb0 = function(err, allChildren) {
            if (err) {
                cb(err);
            } else {
                children = allChildren;
                cb(err, that);
            }

        };
        doChildrenNewInstance(childSpecs, context, that.$, env, secrets,
                              override, cb0);
    };

    /**
     * Gets an array with children in creation order.
     *
     * @return An array with child components.
     *
     * @name gen_container#getChildren
     * @function
     */
    that.getChildren = function() {
        return children;
    };


    var super_shutdown = that.superior('shutdown');

    that.shutdown = function(context, cb) {
        var childrenRev = myutils.cloneReverse(children);
        var cb0 = function(err, sameThat) {
            if (err) {
                // do not unregister to allow retry
                cb(err, sameThat);
            } else {
                super_shutdown(context, cb);
            }
        };
        // use my own context to unregister children
        doChildrenShutdown(childrenRev, that.$, cb0);

    };

    return that;
};
