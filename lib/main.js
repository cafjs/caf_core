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
 * Starts the framework by loading a JSON description and instantiating
 * its components.
 *
 * @module main
 */
var util = require('util');
var path = require('path');
var myutils = require('./myutils');

/* Default name for the config file. It can be changed by defining a binding
 of the form __framework_json -> new_file_name in the top level environment.
 */
var __framework_json = 'framework.json';

/*
 *  Patch environment giving priority in conflicts to existing entries */
/* in spec.env if
 *  override is false or to env if true.
 */
var patchEnv = function(spec, env, override) {
    var newEnv = (override ?
                  myutils.cloneAndMix(spec.env || {}, env) :
                  myutils.cloneAndMix(env, spec.env || {}));
    return myutils.cloneAndMix(spec, {env: newEnv});
};

/**
 * Loads and instantiates a new component.
 *
 * @param {{module: string, name: string, env: Object}} spec Configuration
 *  data for this component extracted from a JSON description.
 * @param {Object} context A context to find needed components (like
 * the loader).
 * @param {Object} env A map with properties that should be mixed with
 *  `spec.env`.
 * @param {Object} secrets Map with run-time information that
 * should be encapsulated within the new component methods.
 * @param {boolean} override If true,  when there is a conflict
 * because a property has been defined in both `env` and `spec.env`,
 * `env` has priority. Otherwise, we keep the value in `spec.env`. If
 * there are no conflicts we always merge properties.
 * @param {caf.cb} cb A callback to return the new component or an error.
 * @function
 */
var loadComponent = exports.loadComponent = function(spec, context, env,
                                                     secrets, override, cb) {
    var module = context.loader.load(spec.module);
    var newSpec = patchEnv(spec, env || {}, override);
    Object.freeze(newSpec);
    module.newInstance(context, newSpec, secrets, cb);
};


var newLoader = function(pathName) {
    var cacheForEver = {};
    var that = {};

    var tryLoad =  function(prefix, object) {
        var newObject = object;
        try {
            if (prefix) {
                newObject = path.join(prefix, object);
            }
            console.log('loading ' + newObject);
            return require(newObject);
        } catch (err) {
            if (err instanceof SyntaxError) {
                console.log('Syntax error in file ' + newObject);
                console.log(util.inspect(err, true, null));
                throw err;
            }
            return false;
        }
    };

    var loadImpl =  function(object) {
        // first, with path provided;
        var result = tryLoad(pathName, object);
        // second, as a global module (i.e., in node_modules)
        if (!result) {
            result = tryLoad(undefined, object);
        }
        // finally, in this directory
        if (!result) {
            result = tryLoad(undefined, './' + object);
        }
        if (!result) {
            throw new Error('Cannot find module:' + object);
        }
        return result;
    };

    that.load =  function(object) {
        var cached = cacheForEver[object];
        if (cached !== undefined) {
            return cached;
        }
        // support for hierarchical modules (separated by '/')
        var splitObj = object.split('/');
        var result = loadImpl(splitObj[0]);
        for (var i = 1; i < splitObj.length; i++) {
            var newResult = result[splitObj[i]];
            if (newResult) {
                result = newResult;
            } else {
                throw new Error('Loader: no property ' +
                                splitObj[i] + ' in ' +
                                util.inspect(result, true, null));
            }
        }
        cacheForEver[object] = result;
        return result;
    };

    that.getPath = function() {
        return pathName;
    };

    return that;
};

/**
 * Main initialization function for the framework.
 *
 * This is typically the last call in your `ca_methods.js` file.
 *
 * It recursively loads and instatiates all the components described
 * in `framework.json`. When all of them are active, it starts
 * listening for requests at an specified port. When the loader cannot
 * find a module it just throws an exception.
 *
 * @param {string} path Directory with json descriptions and
 *  modules. In most cases set to `__dirname` (same directory as your
 *  `ca_methods.js` file).
 * @param {Object} env Map with properties that override the `spec.env` of
 * the top component.
 * @param {caf.cb=} cb An optional  callback that will return an error
 * or the context object with a top level `sup` component (and a
 * `loader` component). This is mainly used for testing/debugging or to
 * implement custom recovery.
 */
exports.init = function(path, env, cb) {
    var context = {};
    var $ = context;
    var secrets = {};
    $.loader = newLoader(path);
    var spec = $.loader.load(env[__framework_json] || __framework_json);
    var newCb = function(err) {
        /* return the top level context, the name of 'sup' is always 'sup'
         so we can recover the data argument in the original callback easily
         from the context. */
        if (cb) {
            cb(err, $);
        } else {
            if (err) {
                console.log('got error ' + err);
                process.exit(1);
            } else {
                $.log && $.log.debug('READY P5JGqWGXOzqOFg ');
            }
        }
    };
    loadComponent(spec, $, env, secrets, true, newCb);
};


// export all the generic constructors
exports.gen_component = require('./gen_component');
exports.gen_container = require('./gen_container');
exports.gen_plug = require('./gen_plug');
exports.gen_redis_plug = require('./gen_redis_plug');
exports.gen_cron = require('./gen_cron');
exports.gen_pipe = require('./gen_pipe');
exports.gen_ca = require('./gen_ca');
exports.gen_handler = require('./gen_handler');
exports.gen_proxy = require('./gen_proxy');
exports.gen_transactional = require('./gen_transactional');
exports.gen_supervisor = require('./gen_supervisor');


// export json interfaces
exports.json_rpc = require('./json_rpc');

// util functions
exports.myutils = require('./myutils');

// export convenient third-party
exports.async = require('async');
exports.redis = require('redis');
