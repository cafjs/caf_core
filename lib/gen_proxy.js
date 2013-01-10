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
 * Generic proxy that enables secure access to local services from
 * application code. 
 * 
 * Proxies are stateless, frozen objects that provide a limited
 * service interface while enforcing security checks on arguments.
 * 
 * 
 * @name gen_proxy
 * @namespace
 * @augments gen_component
 */

var genComponent = require('./gen_component');

/**
 * Constructor method for a generic proxy component.
 *
 * @see gen_component
 *
 */
exports.constructor = function(spec, secrets) {

    var that = genComponent.constructor(spec, secrets);
   
    /**
     * Run-time type information.
     *
     * @type {boolean}
     * @name gen_proxy#isProxy
     */
    that.isProxy = true;

    that.shutdown = function(context, cb) {
        /* Enable frozen proxies by replacing default shutdown method
         that sets 'that.isShutdown' to  true.*/
        if (context[that.getName()] === that) {
            delete context[that.getName()];
        }
        cb(null, that);
    };

    return that;
};
