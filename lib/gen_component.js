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
 * Generic top-level component from which all the other CAF components derive.
 *
 * CAF creates components using a functional-style, which does not use the
 * `new` JavaScript keyword, and relies instead on
 * closures.
 *
 * CAF component construction is asynchronous, using an
 * standard factory method (i.e., `newInstance()`).
 *
 * To simplify writing asynchronous constructors we
 * wrap the synchronous bits of a constructor in an internal
 * factory method (i.e., `constructor()`). Then, we use the following pattern:
 *
 *     var genXX = require('./gen_XX');
 *     ...
 *     exports.newInstance = function(context, spec, secrets, cb) {
 *          var that = genXX.constructor(spec, secrets);
 *          // do asynchronous initialization of 'that' and then call
 *          //   cb(err, that) using the node.js callback convention
 *     }
 *
 * Synchronous (internal) constructors are always defined in files
 * named gen_XXX, and typically just set-up data structures and
 * methods to enable the (asynchronous) initialization of the component.
 *
 * @name gen_component
 * @namespace
 *
 */

/**
 * Constructs a representation for a generic base component.
 *
 *
 * @param {Object} spec Read-only configuration data for this
 * component extracted from a JSON description.
 * @param {Object} secrets  Map with run-time information that
 * should be encapsulated within this component methods.
 * @return A generic root component representation.
 */
exports.constructor = function(spec, secrets) {

    var that = {};

    /**
     * True if this component has already been shutdown.
     *
     * @type {boolean}
     * @name gen_component#isShutdown
     */
    that.isShutdown = false;


    /**
     * Gets the name of this component specified in the JSON description.
     *
     * @return {string} A name for this component.
     * @name  gen_component#getName
     * @function
     */
    that.getName = function() {
        return spec.name;
    };

    /**
     * Gets a module name that implements this component.
     *
     * @return {string} A module name.
     * @name gen_component#getModule
     * @function
     */
    that.getModule = function() {
        return spec.module;
    };

    /**
     * Gets a property map with configuration data for this component.
     *
     * @return {Object} A property map with configuration.
     * @name  gen_component#getEnv
     * @function
     */
    that.getEnv = function() {
        return spec.env || {};
    };

    /**
     * Gets a comment about the purpose of this component.
     *
     * @return {string} A comment about this component.
     * @name   gen_component#getDescription
     * @function
     */
    that.getDescription = function() {
        return spec.description;
    };

    /**
     * Captures a method of the parent class before we override it.
     *
     * For example:
     *
     *     var supHello = that.superior('hello');
     *     that.hello = function() {
     *        supHello(); // call original 'hello'
     *        // do something else
     *     }
     *
     * @param {string} methodName The name of the method that we want
     *to override.
     * @return {function} The function implementing that method in the
     * parent class.
     *
     * @name   gen_component#superior
     * @function
     */
    that.superior = function(methodName) {
        var method = that[methodName];
        return function() {
            return method.apply(that, arguments);
        };

    };

    /**
     * Merges functions defined in a source map into this component.
     *
     * @param {Object} source A map object with functions.
     * @param {boolean} force True if we allow changing existing
     * methods, false if we can silently ignore already defined methods.
     *
     * @name   gen_component#mixin
     * @function
     */
    that.mixin = function(source, force) {
        var methodName;
        for (methodName in source) {
            if (source.hasOwnProperty(methodName) &&
                (force || (that[methodName] === undefined)) &&
                (typeof source[methodName] === 'function')) {
                that[methodName] = source[methodName];
            }
        }
    };


    /**
     * Registers this component in the given context using this
     * component's name as key.
     *
     * @param {Object} context A context to register this component.
     *
     * @name   gen_component#register
     * @function
     */
    that.register = function(context) {
        context[that.getName()] = that;
    };


    /**
     * Shutdowns this component and unregisters it from a given context.
     *
     * A shutdown is irreversible and CAF periodically cleans up dead
     * components.  A shutdown could involve multiple asynchronous.
     *
     * @param {Object} context A context to unregister this component.
     * @param {caf.cb} cb A callback to continue after shutdown.
     *
     * @name gen_component#shutdown
     * @function
     *
     */
    that.shutdown = function(context, cb) {
        that.isShutdown = true;
        if (context && (context[that.getName()] === that)) {
            delete context[that.getName()];
        }
        cb(null, that);
    };

    return that;
};
