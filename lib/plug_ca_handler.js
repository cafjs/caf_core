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
 * A handler object that wraps all the application methods of a CA.
 *
 * @name plug_ca_handler
 * @namespace
 * @augments gen_handler
 *
 */
var assert = require('assert');
var genHandler = require('./gen_handler');

/**
 * Factory method to create a handler object.
 *
 * @see sup_main
 */
exports.newInstance = function(context, spec, secrets, cb) {

    var $ = context;
    var that = genHandler.constructor(spec, secrets);

    $.log && $.log.debug('New handler object');

    that.mixin($.fact.getDefaultMethods(), true);
    that.mixin($.fact.getMethods(), true);

    that.$ = {};
    for (var compName in secrets) {
        var comp = secrets[compName];
        if (comp.isProxy) {
            that.$[compName] = comp;
        }
    }


    /* We want to execute the user defined '__ca_init__' or '__ca_resume__'
     * methods as if they were invoked during the processing of a message,
     * so that we can use transactions, state checkpointing, and so on...
     *
     * The strategy is to delay the actual execution of those methods until
     * a 'first_message' gets processed. By then all the other subsystems
     *  required to process this message have been properly initialized.
     *
     */

    var super__ca_init__ = that.superior('__ca_init__');
    that.__ca_init__ = function(cb) {
        var firstTime = true;
        //Place here initialization of handler needed before processing messages
        that.__ca_first_message__ = function(cb0) {
            if (firstTime) {
                firstTime = false;
                super__ca_init__(cb0);
            } else {
                assert.ok(false, 'Calling first message multiple times');
            }
        };
        cb(null, null);
    };

    var super__ca_resume__ = that.superior('__ca_resume__');
    that.__ca_resume__ = function(cp, cb) {
        var firstTime = true;
        //Place here initialization of handler needed before processing messages
        that.__ca_first_message__ = function(cb0) {
            if (firstTime) {
                firstTime = false;
                super__ca_resume__(cp, cb0);
            } else {
                assert.ok(false, 'Calling first message multiple times');
            }
        };
        cb(null, null);
    };

    /**
     * Handles a first message to trigger initialization.
     *
     *   We want to execute the user defined `__ca_init__` or `__ca_resume__`
     * methods as if they were invoked during the processing of a message,
     * so that we can use transactions, state checkpointing, and so on...
     *
     * The strategy is to delay the actual execution of those methods until
     * a dummy 'first message' gets processed. By then all the other subsystems
     *  required to process this message have been properly initialized.
     *
     * @param {caf.cb} cb A callback to continue after initialization.
     *
     * @name plug_ca_handler#__ca_first_message__
     * @function
     */
    that.__ca_first_message__ = function(cb) {
        assert.ok(false, 'Receiving first message before init or resume');
    };

    Object.seal(that);
    cb(null, that);
};
