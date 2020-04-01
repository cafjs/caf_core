// Modifications copyright 2020 Caf.js Labs and contributors
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
'use strict';
/**
 * Main package module.
 *
 * @module caf_core/main
 *
 */

/* eslint-disable max-len */

/**
 * @external caf_ca
 * @see {@link https://cafjs.github.io/api/caf_ca/index.html}
 */

/**
 * @external caf_components
 * @see {@link https://cafjs.github.io/api/caf_components/index.html}
 */
/* eslint-enable max-len */

exports.caf_cli = require('caf_cli');
const caf_ca = exports.caf_ca = require('caf_ca');
exports.caf_session = require('caf_session');

const caf_platform = exports.caf_platform = require('caf_platform');
exports.caf_security = caf_platform.caf_security;
const caf_comp = exports.caf_components = caf_platform.caf_components;
const caf_transport = exports.caf_transport = caf_platform.caf_transport;
exports.caf_redis = caf_platform.caf_redis;
exports.caf_sharing = caf_platform.caf_sharing;
exports.caf_pubsub = caf_platform.caf_pubsub;

exports.async = caf_platform.async;
const path = require('path');

const myUtils = caf_comp.myUtils;


/**
 * Splits a compound name into namespace root and local name.
 *  The convention is to use the character '-' to separate them.
 *
 * @param {string} name A name to split.
 * @param {string=} separator Optional separator to override '-'.
 * @return {Array.<string>} An array with two elements: namespace root and
 * local name, or three if it also has a map name, or four if fully
 * qualified CA name ,i.e., `appPublisher-appLocalName-caOwner-caLocalName`.
 *
 * @throws {Error} Invalid compound name.
 *
 * @memberof!  module:caf_core/main
 * @alias splitName
 *
 */
exports.splitName = function(name, separator) {
    return caf_transport.json_rpc.splitName(name, separator);
};

/**
 * Joins partial names using the standard separator.
 *
 * @param {...string} strings A var number of strings.
 * @return {string} A joined name with the standard separator.
 *
 * @memberof! module:caf_core/main
 * @alias joinName
 */
exports.joinName = function(strings) { // eslint-disable-line no-unused-vars
    const args = Array.prototype.slice.call(arguments);
    const joinNameF = caf_transport.json_rpc.joinName;
    return joinNameF.apply(joinNameF, args);
};

/**
 * Main initialization function for the framework.
 *
 * This is typically the last call in your `ca_methods.js` file.
 *
 * It recursively loads and instantiates all the components described
 * in `framework.json`. When all of them are active, it starts
 * listening for requests at an specified port.
 *
 * @param {(NodeJS.Module | Array.<NodeJS.Module>)=} modules An optional
 *  sequence of modules (or just one) to load descriptions and implementations.
 * @param {specDeltaType=} spec Extra configuration data that will be merged
 *  with the framework components description. For example, to override the
 *  default name of the top component using `spec.name`.
 * @param {string=} frameworkFileName An optional file name containing a
 *  description of the framework components. It defaults to `framework.json`.
 * @param {cbType=} cb An optional  callback that will return an error
 * or the context `$` with the created top level component bound by its name.
 *
 * @memberof! module:caf_core/main
 * @alias init
 */
exports.init = function(modules, spec, frameworkFileName, cb) {

    const cb0 = function(err, $) {
        if (cb) {
            cb(err, $);
        } else {
            if (err) {
                // eslint-disable-next-line
                console.log('Got error ' + myUtils.errToPrettyStr(err));
                process.exit(1);
            } else {
                $._.$.log && $._.$.log.debug('READY P5JGqWGXOzqOFg');

                process.on('SIGTERM', function() {
                    const msg = 'Caught SIGTERM signal (stop container) at ' +
                              (new Date()).getTime();

                    if ($._ && $._.$ && $._.$.log) {
                        $._.$.log.warn(msg);
                    } else {
                        // eslint-disable-next-line
                        console.log(msg);
                    }
                    if ($._ && $._.__ca_graceful_shutdown__) {
                        $._.__ca_graceful_shutdown__(null, function(err) {
                            // eslint-disable-next-line
                            console.log('shutdown:' + (err ? err : 'OK') +
                                       ' at ' + (new Date()).getTime());
                            process.exit(err ? 1 : 0);
                        });
                    } else {
                        // eslint-disable-next-line
                        console.log('Error: missing top level component');
                        process.exit(1);
                    }
                });
            }
        }
    };
    frameworkFileName = frameworkFileName || 'framework.json';

    modules = modules || [];
    if (!Array.isArray(modules)) {
        modules = [modules];
    }


    modules.push(module);
    modules.push(caf_platform.getModule());
    modules.push(caf_ca.getModule());

    spec = spec || {};
    spec.env = spec.env || {};
    if (!spec.env.publicPath) {
        if (modules.length > 3) {
            // user provided module, assume first one defines top level:
            //    'app/lib/node_modules'
            // and the target path is 'app/public'
            spec.env.publicPath = path.resolve(modules[0].paths[0],
                                               '../../public/');
        } else {
            // assume no symbolic link to caf_core lib
            // so the file layout is  'app/node_modules/caf_core/lib'
            //      and 'app/public'
            spec.env.publicPath = path.resolve(__dirname,
                                               '../../../public/');
        }
    }

    caf_comp.load(null, spec, frameworkFileName, modules, cb0);

};
