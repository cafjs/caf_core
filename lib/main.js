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


exports.caf_cli = require('caf_cli');
var caf_ca = exports.caf_ca = require('caf_ca');
exports.caf_session = require('caf_session');

var caf_platform = exports.caf_platform = require('caf_platform');
exports.caf_security = caf_platform.caf_security;
var caf_comp = exports.caf_components = caf_platform.caf_components;
exports.caf_transport = caf_platform.caf_transport;
exports.caf_redis = caf_platform.caf_redis;
exports.caf_sharing = caf_platform.caf_sharing;

exports.async = caf_platform.async;
var path = require('path');

var myUtils = caf_comp.myUtils;

/**
 * Main initialization function for the framework.
 *
 * This is typically the last call in your `ca_methods.js` file.
 *
 * It recursively loads and instatiates all the components described
 * in `framework.json`. When all of them are active, it starts
 * listening for requests at an specified port.
 *
 * @param {(Module | Array.<Module>)=} modules An optional sequence of modules
 *  (or just one) to load descriptions and implementations .
 * @param {caf.specType=} spec Extra configuration data that will be merged
 *  with the framework components description. For example, to override the
 *  default name of the top component using `spec.name`.
 * @param {string=} frameworkFileName An optional file name containing a
 *  description of the framework components. It defaults to 'framework.json'.
 * @param {caf.cb=} cb An optional  callback that will return an error
 * or the context objecA callback to return `$` with the created top level
 * component bound by its name or an error.
 *
 */
exports.init = function(modules, spec, frameworkFileName, cb) {

    var cb0 = function(err, $) {
         if (cb) {
            cb(err, $);
        } else {
            if (err) {
                console.log('Got error ' + myUtils.errToPrettyStr(err));
                process.exit(1);
            } else {
                $._.$.log && $._.$.log.debug('READY P5JGqWGXOzqOFg');

                process.on('SIGTERM', function() {
                    var msg = 'Caught SIGTERM signal (stop container) at ' +
                            (new Date()).getTime();

                    if ($._ && $._.$ && $._.$.log) {
                        $._.$.log.warn(msg);
                    } else {
                        console.log(msg);
                    }
                    if ($._ && $._.__ca_graceful_shutdown__) {
                        $._.__ca_graceful_shutdown__(null, function(err) {
                            console.log('shutdown:' + (err ?  err : 'OK') +
                                       ' at ' + (new Date()).getTime());
                            process.exit(err ? 1 : 0);
                        });
                    } else {
                        console.log('Error: missing top level component');
                        process.exit(1);
                    }
                });
            }
        }
    };
    frameworkFileName = frameworkFileName || 'framework.json';

    if (modules && !Array.isArray(modules)) {
        modules = [modules];
    }

    modules = modules || [];
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




