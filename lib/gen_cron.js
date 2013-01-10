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
 * Generic cron component.
 *
 * A cron performs the same task every `interval` seconds.
 *
 * @name gen_cron
 * @namespace
 * @augments gen_component
 *
 */


var genComponent = require('./gen_component');

/**
 * Constructor method for a generic cron component.
 *
 * @see gen_component
 */
exports.constructor = function(spec, secrets) {

    var that = genComponent.constructor(spec, secrets);

    /**
     * Run-time type information.
     *
     * @type {boolean}
     * @name gen_cron#isCron
     */
    that.isCron = true;

    /**
     * Gets the time in seconds between tasks as defined in property
     * `env.interval`.
     *
     * @return The time interval between repeated task invocations.
     *
     * @name gen_cron#getInterval
     * @function
     */
    that.getInterval = function() {
        return spec.env.interval;
    };

    /**
     * Starts the cron.
     *
     * @param {function()} fun A task to be performed repeatedly.
     *
     *
     * @name gen_cron#start
     * @function
     */
    that.start = function(fun) {
        that.intervalId = setInterval(fun, 1000 * that.getInterval());
        return that.intervalId;
    };

    /**
     * Finishes the execution of periodic tasks.
     *
     * Shutting down a cron always stops it.
     * 
     * @name gen_cron#end
     * @function
     */
    that.stop = function() {
        if (that.intervalId) {
            clearInterval(that.intervalId);
            delete that.intervalId;
        }
    };

    var super_shutdown = that.superior('shutdown');

    that.shutdown = function(context, cb) {
        that.stop();
        super_shutdown(context, cb);
    };


    return that;
};
