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
 * Generic CA handler plug.
 *
 * A handler combines custom application methods with CA-private state.
 *
 * CAF binds methods to the handler object enabling user code to
 * access CA state using `this`, i.e., a traditional, non-functional,
 * object abstraction.
 *
 *
 * @name gen_handler
 * @namespace
 * @augments gen_transactional
 *
 */

var genTransactional = require('./gen_transactional');

/**
 * Constructor method for a generic CA handler plug.
 *
 * @see gen_component
 *
 */
exports.constructor = function(spec, secrets) {

    var that = genTransactional.constructor(spec, secrets);

    /**
     * Run-time type information.
     *
     * @type {boolean}
     * @name gen_handler#isHandler
     */
    that.isHandler = true;

    /**
     * JSON-serializable representation of CA private state.
     *
     * The contents of this variable are always checkpointed before
     * any state externalization.
     *
     * @type {Object}
     * @name gen_handler#state
     */
    that.state = {};

    /**
     * Contains anything but it is not guaranteed to be preserved across
     * message invocations.
     *
     * It is useful for caching since _in most cases_ it will be preserved
     * across messages.
     *
     * @type {Object}
     * @name gen_handler#scratch
     */
    that.scratch = {};

    /**
     * Version of the current application code.
     *
     * It is specified in `ca.json` with the property `spec.env.version`
     * in the handler section.
     *
     * The version of the code that created the last checkpoint is
     * also part of the checkpoint. This enables upgrading the
     * checkpointed state with a custom method in `__ca_resume__` when needed.
     *
     * @type {string}
     * @name gen_handler#version
     *
     */
    that.version = spec.env.version;

    /* Backup for state and version to provide a default
     * transactional rollback behavior for the handler.
     *
     * @see ca_default_methods
     * @protected
     */
    that.state_backup_ = '';
    that.version_backup_ = that.version;

    return that;
};
