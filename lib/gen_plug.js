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
 * Generic plug component.
 *
 * A plug is a passive interface to the external world (or to a local
 * service). In the local case it could also implement the service as
 * long as this is transparent to its clients.
 *
 * @name gen_plug
 * @namespace
 * @augments gen_component
 */



var genComponent = require('./gen_component');

/**
 * Constructor method for a generic plug component.
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
     * @name gen_plug#isPlug
     */
    that.isPlug = true;

    return that;
};
