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
 * Generic message processing pipeline component.
 * 
 * 
 * @name gen_pipe
 * @namespace
 * @augments gen_component
 */
var genComponent = require('./gen_component');

/**
 * Constructor method for a generic message processing pipeline component.
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
     * @name gen_pipe#isPipe
     */
    that.isPipe = true;

    /**
     * Pipeline object.
     * 
     * @type {Object}
     * @name gen_pipe#app
     */
    that.app = null;

    var super_shutdown = that.superior('shutdown');

    that.shutdown = function(context, cb) {
        var cb0 = function(err, data) {
            if (that.app) {
                that.app.close();
            }
            cb(err, data);
        };
        super_shutdown(context, cb0);
    };

    return that;
};
