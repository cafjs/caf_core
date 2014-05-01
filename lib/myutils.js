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
/**
 * Miscellaneous collection of functions.
 *
 * @module myutils
 *
 */

var assert = require('assert');
/**
 * Flattens an array containing arrays
 *
 */
exports.flatten = function(array) {
    var result = [];
    return result.concat.apply(result, array);
};

/**
 * Flattens a deeply nested array containing arrays.
 * @function
 */
var deepFlatten = exports.deepFlatten = function(array) {
    if (Array.isArray(array)) {
        return array.reduce(function(previousValue, currentValue) {
            if (Array.isArray(currentValue)) {
                return previousValue.concat(deepFlatten(currentValue));
            } else {
                previousValue.push(currentValue);
                return previousValue;
            }
        }, []);
    } else {
        return array;
    }
};



/** Clones an array reversing its elements.*/
exports.cloneReverse = function(array) {
    assert.ok(Array.isArray(array), 'reversing a non-array');
    return array.slice(0).reverse();
};

/** Mixes-in properties from a source object.
 * @function
 */
var mix = exports.mix = function(dest, source) {
    var result = dest;
    var x;
    for (x in source) {
        if (source.hasOwnProperty(x)) {
            dest[x] = source[x];
        }
    }
    return result;
};

/** Clones arrays or objects.
 * @function
 */
var clone = exports.clone = function(obj) {
    if (Array.isArray(obj)) {
        return obj.slice(0);
    } else if (typeof obj === 'object') {
        return mix({},obj);
    } else {
        // assume immutable
        return obj;
    }
};

/**
 * Binds all the functions in an object so that 'this' is set to 'self'.
 * Ignores fields that are not functions.
 *
 *
 * @param {Object} self A value for 'this'.
 * @param {Object} obj A map with a collection of functions.
 *
 * @return {Object} A collection of bound functions in a map object.
 *
 */
exports.bind = function(self, obj) {
    if (obj && typeof obj === 'object') {
        var result = {};
        Object.keys(obj).forEach(function(x) {
                                     if (typeof obj[x] === 'function') {
                                         result[x] = obj[x].bind(self);
                                     }
                                 });
        return result;
    }
    return null;
};

/** Clones an object before mix-in some properties for a source object.
 * @function
 */
exports.cloneAndMix = function(dest, source) {
    return mix(clone(dest), source);
};


// the cookie method in 'res' formats the value using uri encoding
//  and unfortunately cloud foundry expects base64 encoding for
// the encripted cookies. This breaks because the character '/'
// valid for base 64 gets mapped to '%2F'...

/**
 * Sets a cookie in the response stream that never expires.
 *
 * We cannot use the built-in cookie method in 'res' because Cloud Foundry
 * uses base64  encoding (instead of URI encoding) for encrypted cookies.
 * @function
 */
var setForeverCookie = exports.setForeverCookie = function(res, name, value) {
    var pairs = [name + '=' + value];
    pairs.push('path=/');
    var expires = (new Date(Date.now() + FOREVER)).toUTCString();
    pairs.push('expires=' + expires);
    var cookie = pairs.join('; ');
    res.header('Set-Cookie', cookie);
};
