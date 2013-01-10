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
 * Generic top level supervisor component. 
 * 
 * @name gen_supervisor
 * @namespace
 * @augments gen_container 
 */
var genContainer = require('./gen_container');

/**
 * Constructor method for a generic supervisor component.
 *
 * @see gen_component
 *
 */
exports.constructor = function(spec, secrets) {

    var that = genContainer.constructor(spec, secrets);

    /**
     * Run-time type information.
     *
     * @type {boolean}
     * @name gen_supervisor#isSup
     */ 
    that.isSup = true;

    return that;
};
