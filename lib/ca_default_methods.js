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
 *  Default implementation of CA methods called by the framework.
 *
 * These methods are mixed-in with the CA object when they have not
 * been previously defined. Therefore, an application could redefine
 * these methods in `ca_methods.js`.
 *
 * Note that only functions are mixed in, so any object variables
 * defined in the 'methods' object is just ignored.
 *
 * Also, it is not recommended to use closure scoping to refer to
 * writeable variables because they are not part of the checkpointed
 * state, and there is no guarantee that their content will be preserved
 * across message invocations.
 *
 * Use instead `this.state` with a JSON-serializable data structure
 * because it is transparently checkpointed by CAF.
 *
 * All these methods take a callback argument with similar semantics
 * to node.js callbacks, i.e., the first argument is the error object
 * (that should be a falsy when everything went fine), and the others
 * the returned values from the method.
 *
 * Callbacks are needed to inform the framework that we can accept the
 * next message,  and also to return to the caller the result of processing the
 * previous message. Note that a traditional `return`
 * would not have allowed asynchronous node.js calls in methods.
 *
 * The life-cycle of a CA is as follows:
 *
 *  INIT -> ([TERMINATE] -> RESUME)* -> DESTROY
 *
 * INIT creates a CA with a given unique id and makes it active (i.e.,
 * starts receiving PULSE and other messages).
 *
 * During migration or code upgrading CAF firsts TERMINATEs the CA and
 * then RESUMEs it with the new code or at a different node. These
 * transitions could happen many times, but CAF guarantees that no
 * externalized state is lost. Failures could provoke a RESUME without
 * a TERMINATE but we still provide the same state guarantees
 * with respect to externalization.
 *
 * DESTROY globally eliminates any state or reference to that CA
 * (identified by its unique ID).
 *
 * @see http://www.cafjs.com
 *
 * @name ca_default_methods
 * @namespace
*/
exports.methods = {


    /**
     * Initializes the state of this plug from scratch.
     *
     * This method is called by CAF only once, i.e.,  when the plug is created.
     *
     * The default implementation does nothing.
     *
     * @param {caf.cb} cb A callback to continue after initialization.
     *
     * @name ca_default_methods#__ca_init__
     * @function
     */
    '__ca_init__' : function(cb) {
        cb(null);
    },

    /**
     * Initializes the state of this plug from a previous checkpoint.
     *
     * This method can be called by CAF many times, for example, after
     * recovering  from a failure or to enable migration.
     *
     * Versioning information in both the checkpoint and the variable
     * `this.version` helps us to properly upgrade the structure of
     * the checkpointed state using a custom function, and before
     * the processing of new messages.
     *
     * @param {Object} cp The last checkpoint of the state of this plug.
     * @param {caf.cb} cb A callback to continue after resuming.
     *
     * @name  ca_default_methods#__ca_resume__
     * @function
     */
    '__ca_resume__' : function(cp, cb) {
        this.state = cp && cp.state;
        this.state = this.state || {};
        this.version = cp && cp.version; // assumed it did not change
        cb(null);
    },

    /**
     * Enables autonomous computation by processing pulse messages that
     * CAF periodically sends to all CAs.
     *
     * @param {caf.cb} cb A callback to continue after pulse.
     * @name  ca_default_methods#__ca_pulse__
     * @function
     */
    '__ca_pulse__' : function(cb) {
        cb(null);
    },

    /**
     * Allows custom termination behavior when this CA gracefully
     * stops.   This is useful to, for example, tidy up its internal
     * state before the last checkpoint or finalize external interactions.
     *
     * There is no guarantee that this method will be called before
     * stopping, and application logic should view it as an
     * optimization.
     *
     *
     * @param {caf.cb} cb A callback to continue after custom termination.
     * @name  ca_default_methods#__ca_terminate__
     * @function
     *
     */
    '__ca_terminate__' : function(cb) {
        cb(null, {'state' : this.state, 'version' : this.version});
    },


    /* Transactional methods to recover a consistent state snapshot
     in case of errors. To enable them the property isTransactional should be
     set to true.*/

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
     * @name ca_default_methods#__ca_begin__
     * @function
     *
     */
    '__ca_begin__' : function(msg, cb) {
        this.state_backup_ = JSON.stringify(this.state);
        this.version_backup_ = this.version;
        cb(null);
    },

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
     * @name ca_default_methods#__ca_prepare__
     * @function
     */
     '__ca_prepare__' : function(cb) {
        cb(null, JSON.stringify({'state' : this.state,
                                 'version' : this.version}));
    },


    /**
     * Commits the transaction.
     *
     * Called by CAF when all the `prepare` calls to transactional
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
     * @name ca_default_methods#__ca_commit__
     * @function
     */
     '__ca_commit__' : function(cb) {
        cb(null);
    },


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
     * @name ca_default_methods#__ca_abort__
     * @function
     */
    '__ca_abort__' : function(cb) {
        if (this.state_backup_) {
            this.state = JSON.parse(this.state_backup_);
        }
        if (this.version_backup_) {
            this.version = this.version_backup_;
        }
        cb(null);
    }
};
