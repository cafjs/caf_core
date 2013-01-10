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
 * Generic transactional plug that maintains state across message invocations.
 * 
 * Transactional plugs participate in a two-phase commit protocol with other 
 * (local) transactional plugs.
 * 
 * @name gen_transactional
 * @namespace
 * @augments gen_plug
 */
var genPlug = require('./gen_plug');

/**
 * Constructor method for a generic transactional plug.
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
     * @name gen_transactional#isTransactional
     */
    that.isTransactional = true;

    /**
     * Initializes the state of this plug from scratch.
     * 
     * This method is called by CAF only once, i.e.,  when the plug is created.
     * 
     * The default implementation does nothing.
     * 
     * @param {caf.cb} cb A callback to continue after initialization.
     * 
     * @name gen_transactional#__ca_init__
     * @function
     */
    that.__ca_init__ = function(cb) {
        cb(null);
    };

    /**
     * Initializes the state of this plug from a previous checkpoint.
     * 
     * This method can be called by CAF many times, for example, after
     * recovering  from a failure or to enable migration.
     * 
     * @param {Object} cp The last checkpoint of the state of this plug.
     * @param {caf.cb} cb A callback to continue after resuming.
     * 
     * @name gen_transactional#__ca_resume__
     * @function   
     */
    that.__ca_resume__ = function(cp, cb) {
        cb(null);
    };

    /**
     * Begins a two phase commit transaction.
     * 
     * CAF calls this method before the application handler processes
     * a message. A read-only copy of the message is passed as an argument
     * to facilitate configuration.
     * 
     * @param {Object} msg The message to be processed.
     * @param {caf.cb} cb A callback to continue the transaction.
     * 
     * @name gen_transactional#__ca_begin__
     * @function   
     *
     */
    that.__ca_begin__ = function(msg, cb) {
        cb(null);
    };

    /**
     * Prepares to commit the transaction.
     * 
     * CAF calls this method after the handler has succesfully
     * processed the message.
     * 
     * If ready to commit, it returns in the callback a JSON
     * serializable data structure reflecting the new state after
     * processing the message. 
     * 
     * To abort the transaction we return an error in the (node.js) callback.
     * This will abort all the transactional plugs associated with the CA.
     * 
     * @param {caf.cb} cb A callback to continue or abort the transaction.
     * 
     * @name gen_transactional#__ca_prepare__
     * @function 
     */
    that.__ca_prepare__ = function(cb) {
        cb(null, null);
    };

    /**
     * Commits the transaction.
     * 
     * Called by CAF when all the`prepare` calls to transactional
     * plugs were
     * successful, and the new state  of those plugs has been
     * checkpointed using an external service (e.g., Redis).
     * 
     * An error during commit shutdowns the CA since we cannot abort
     * committed transactions. When the
     * shutdown CA gets recreated, possibly in a different server, all
     * the commit operations are retried. It is the responsability of
     * the plug implementation to make commit operations idempotent.
     * 
     * 
     * @param {caf.cb} cb A callback to continue after commiting.
     * 
     * @name gen_transactional#__ca_commit__
     * @function 
     */
    that.__ca_commit__ = function(cb) {
        cb(null);
    };

    /**
     * Aborts the transaction.
     * 
     * CAF calls this method when an error was returned
     * by the handler, or any transactional plug did not 'prepare'
     * OK. 
     * 
     * Note that an error during (remote) checkpointing cannot
     * guarantee that the checkpoint was not made durable, and we need to
     * assume that it did; this means that we need to shutdown the CA.
     * 
     * An implementation of this method should undo state changes and
     * ignore deferred  external interactions.
     * 
     * @param {caf.cb} cb A callback to continue after aborting.
     * 
     * @name gen_transactional#__ca_abort__
     * @function 
     */
    that.__ca_abort__ = function(cb) {
        cb(null);
    };

    return that;
};
