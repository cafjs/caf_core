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
 * A plug object that manages the input message queue of a CA.
 *
 * @name plug_ca_inqueue
 * @namespace
 * @augments gen_plug
 *
 */
var async = require('async');
var genPlug = require('./gen_plug');

/**
 * Factory method to create a manager of the input message queue.
 *
 *  @see sup_main
 */
exports.newInstance = function(context, spec, secrets, cb) {

    var that = genPlug.constructor(spec, secrets);
    var queue;
    var $ = context;

    $.log && $.log.debug('New inQueue Manager plug');

    /**
     *  Gets the input message queue of this CA.
     *
     * @return {Object} The input message queue of this CA. This queue
     * provides a `length()` method to find out the number of pending messages.
     *
     * @name plug_ca_inqueue#getQueue
     * @function
     *
     */
    that.getQueue = function() {
        return queue;
    };


    /**
     * Queues a message to be processed by this CA.
     *
     * @param {Object} msg A message to be processed.
     * @param {caf.cb} cb A callback function to continue after
     * processing the message and to propagate a response to the caller.
     *
     *
     * @name plug_ca_inqueue#process
     * @function
     */
    that.process = function(msg, cb) {
        queue.push(msg, cb);
    };

    /**
     * Creates a new queue.
     *
     * @param {function(Object, caf.cb)} worker A handler function to
     * process  a message.
     *
     * @return {Object} A new queue.
     *
     * @name plug_ca_inqueue#newQueue
     * @function
     */
    that.newQueue = function(worker) {
        queue = async.queue(worker, 1);
        return queue;
    };

    var super_shutdown = that.superior('shutdown');
    that.shutdown = function(context0, cb) {

        if (queue.length() !== 0) {
            $.log && $.log.warn('Warning: shutting down CA with ' +
                                queue.length() + ' unprocessed messages');
        }
        super_shutdown(context0, cb);
    };

    cb(null, that);
};
