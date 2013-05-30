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
 * Functions to manipulate cookies in a way compatible with the base-64 encoding
 * needed by Cloud Foundry.
 *
 * @module cookies
 */
var myutils = require('./myutils');
var FOREVER = 100000000000; // 'never expire' time for cookie

/**
 * Cookie factory method.
 *
 * @param {{name: string, value: value}} spec A cookie description.
 * @return {Object} A cookie object.
 * @function
 *
 */
var constructor = exports.constructor = function(spec) {
    var that = { 'name' : spec.name,
                 'value' : spec.value};
    that.toString = function() {
        return (that.name + '=' + that.value);
    };

    that.toHeader = function() {
        var result = [that.toString()];
        var expires = (new Date(Date.now() + FOREVER)).toUTCString();
        result.push('expires=' + expires);
        result.push('path=/');
        return result.join('; ');
    };

    return that;

};

var newCookie = function(str) {
    var index = str.indexOf('=');
    return constructor({
                           'name' : str.substr(0, index).trim(),
                           'value': str.substr(index + 1, str.length).trim()
                       });
};

/**
 * CookieJar factory method.
 *
 * @param {Array.<Object>} cookieArray A collection of cookies.
 * @return {Object} A cookie jar containing the cookies.
 * @function
 *
 */
var newCookieJar = exports.newCookieJar = function(cookieArray) {
    var that = {};
    cookieArray = (Array.isArray(cookieArray) ? cookieArray : [cookieArray]);
    for (var i = 0; i < cookieArray.length; i++) {
        var cookie = cookieArray[i];
        that[cookie.name] = cookie;
    }

    that.addCookie = function(cookie) {
        that[cookie.name] = cookie;
    };

    that.toString = function() {
        var result = [];
        for (var cookieName in that) {
            if (typeof that[cookieName] !== 'function') {
                result.push(that[cookieName].toString());
            }
        }
        return result.join('; ');


    };

    that.toHeader = function() {
        var result = [];
        for (var cookieName in that) {
            if (typeof that[cookieName] !== 'function') {
                result.push(that[cookieName].toHeader());
            }
        }
        return result;
    };

    return that;
};

/**
 *  Parses cookies from an string, list of strings or
 * nested list of strings.
 *
 * @param {Object} str A string, list of strings or
 * nested list of strings representing cookies.
 * @return {Object} A cookie jar with parsed cookies.
 */
exports.parseCookies = function(str) {
    if (!str) {
        return {};
    }
    var array = (Array.isArray(str) ? str : [str]);
    var flatArray = myutils.deepFlatten(array);
    var result = flatArray.map(function(x) {
                                   return x.split(';').map(
                                       function(y) {
                                           return newCookie(y);
                                       });
                               });
    return newCookieJar(myutils.deepFlatten(result));
};




