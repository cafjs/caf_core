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
 * A proxy that allows a CA to access its input queue.
 * 
 * @name proxy_inqueue
 * @namespace
 * @augments gen_proxy
 * 
 */
var genProxy = require('./gen_proxy');

/**
 * Factory method to create a proxy to access an input queue.
 *
 * @see sup_main
 */
exports.newInstance = function(context, spec, secrets, cb) {

    var that = genProxy.constructor(spec, secrets);

    var inqMgr = secrets.inqMgr;

    /**
     * Gets the number of pending messages in the input queue.
     * 
     * @return {number} The number of messages in the input queue.
     * 
     * @name proxy_inqueue#queueLength
     * @function
     */
    that.queueLength = function() {
        return inqMgr.getQueue().length();

    };

    Object.freeze(that);
    cb(null, that);

};
