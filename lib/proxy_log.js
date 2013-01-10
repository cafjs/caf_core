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
 * Proxy to access the system logger from application code.
 *
 * @name proxy_log
 * @namespace
 * @augments gen_proxy
 * 
 */
var genProxy = require('./gen_proxy');

/**
 * Factory method to create a proxy to access the logger.
 *
 * @see sup_main
 */
exports.newInstance = function(context, spec, secrets, cb) {

    var $ = context;
    var that = genProxy.constructor(spec, secrets);
    var log = $.log;
    var prefix = '<<' + secrets.myId + '>>';

    /**
     * Checks if a candidate level would log with current settings.
     *
     * @param {string} candidateLevel A candidate level.
     * @return {boolean} True if that level is logged.
     * @name proxy_log#isActive
     * @function
     *
     */
     that.isActive = function(candidateLevel) {
        return log && log.isActive(candidateLevel);
    };

    /**
     * Logs msg at FATAL level.
     *
     * @param  {string} msg A message to be logged.
     * @name proxy_log#fatal
     * @function
     *
     */
    that.fatal = function(msg) {
        log && log.fatal(prefix + msg);
    };

    /**
     * Logs msg at ERROR level.
     *
     * @param  {string} msg A message to be logged.
     * @name proxy_log#error
     * @function
     *
     */
    that.error = function(msg) {
        log && log.error(prefix + msg);
    };

    /**
     * Logs msg at WARN level.
     *
     * @param  {string} msg A message to be logged.
     * @name proxy_log#warn
     * @function
     *
     */
    that.warn = function(msg) {
        log && log.warn(prefix + msg);
    };

    /**
     * Logs msg at INFO level.
     *
     * @param  {string} msg A message to be logged.
     * @name proxy_log#info
     * @function
     *
     */
     that.info = function(msg) {
        log && log.info(prefix + msg);
    };

    /**
     * Logs msg at DEBUG level.
     *
     * @param  {string} msg A message to be logged.
     * @name proxy_log#debug
     * @function
     *
     */
    that.debug = function(msg) {
        log && log.debug(prefix + msg);
    };

    /**
     * Logs msg at TRACE level.
     *
     * @param  {string} msg A message to be logged.
     * @name proxy_log#trace
     * @function
     *
     */
    that.trace = function(msg) {
        log && log.trace(prefix + msg);
    };

    Object.freeze(that);
    cb(null, that);
};
