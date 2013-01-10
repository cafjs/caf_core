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
 * A  lookup service for local CAs.
 *
 * @name plug_lookup
 * @namespace
 * @augments gen_plug
 *
 */
var async = require('async');
var genPlug = require('./gen_plug');

/**
 * Factory method to create a lookup plugin.
 *
 * @see sup_main
 */
exports.newInstance = function(context, spec, secrets, cb) {

    var that = genPlug.constructor(spec, secrets);
    var $ = context;

    $.log && $.log.debug('New lookup plug');
    var all = {};

    /**
     * Looks up a local CA.
     *
     * @param {string} caId A CA identifier.
     *
     * @return {Object} A CA or undefined.
     *
     * @name plug_lookup#find
     * @function
     */
    that.find = function(caId) {
        return all[caId];
    };

    /**
     * Unregisters a CA.
     *
     * @param {string} caId A CA identifier.
     *
     * @name plug_lookup#remove
     * @function
     */
    that.remove = function(caId) {
        delete all[caId];
    };

    /**
     * Registers a CA.
     *
     * @param {string} caId A CA identifier.
     * @param {Object} ca A CA.
     *
     * @name plug_lookup#add
     * @function
     */
    that.add = function(caId, ca) {
        all[caId] = ca;
    };

    /**
     * Returns all the entries in an array.
     *
     *  Each array entry is
     *  an object with 'key' and 'value' fields representing the
     * id and reference of a CA.
     *
     * @name plug_lookup#toArray
     * @function
     */
    that.toArray = function() {
        var result = [];
        var id;
        for (id in all) {
            result.push({'key': id, 'value' : all[id]});
        }
        return result;
    };

    /**
     * Fold-like iteration on all the registered CAs.
     *
     * Takes a function (id, CA, accumulator) -> accumulator,
     * an initial value for the accumulator,
     *  and iterates through all entries threading the accumulator
     *
     * @param {function(string, Object, Object): Object} fun An
     * operation on all CAs.
     * @param {Object} acc An object to accumulate results.
     * @return {Object} The accumulator object.
     *
     * @name plug_lookup#fold
     * @function
     */
    that.fold = function(fun, acc) {
        var res = acc;
        var id;
        for (id in all) {
            res = fun(id, all[id], res);
        }
        return res;
    };

    /**
     * Applies in parallel a function to all the key/value objects
     * representing registered CAs. This function should have the type:
     *   ({key: string, value: Object}, callback(err)) -> undefined
     *
     * where `callback` should be called after the processing of each
     * entry, and it should return an error if the processing of any entry
     * produced an error.
     *
     * @param {function} fun A processing function.
     * @param {caf.cb} cb0 A callback function to continue after all ops.
     *
     * @name plug_lookup#forEachAsync
     * @function
     */
    that.forEachAsync = function(fun, cb0) {
        var input = that.toArray();
        async.forEach(input, fun, cb0);
    };

    cb(null, that);

};
