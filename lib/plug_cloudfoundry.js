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
 * A plug to access properties of external services managed by Cloud
 *  Foundry.
 *
 * Example of configuration data (in framework.json) to
 * debug CAF in local mode (i.e., without using Cloud Foundry).
 *
 *          {
 *            "module": "plug_cloudfoundry",
 *            "name": "cf",
 *            "env": {
 *                "redis" : {
 *                    "port" : 6379,
 *                    "hostname" : "localhost",
 *                    "password" : "pleasechange"
 *                }
 *            }
 *          }
 *
 *
 * @name plug_cloudfoundry
 * @namespace
 * @augments gen_plug
 */

var genPlug = require('./gen_plug');


var vcapServices = (typeof process.env.VCAP_SERVICES === 'string' ?
                     JSON.parse(process.env.VCAP_SERVICES) : {});


/*
 *  format example for vcapServices:
 *
 *  {'redis-<version>' : [ {'name' : <string>,
 *                          'credentials' : { 'hostname': <string>,
 *                                             'port': <number> ,
 *                                             'password' : <string>,...
 *                                          },...
 *                          }
 *                        ]}
 *
 */
var getServiceConfig = function(typePrefix, name) {
    var matchType = new RegExp('^' + typePrefix);
    for (var type in vcapServices) {
        if (matchType.test(type)) {
            var svcDef = vcapServices[type];
            if (Array.isArray(svcDef)) {
                if (name) {
            for (var svc in svcDef) {
                var val = svcDef[svc];
                if ((typeof val === 'object') && (val.name === name)) {
                    return val.credentials;
                }
            }
                } else {
                    var service = svcDef[0];
                    if (typeof service === 'object') {
                        return service.credentials;
                    }
                }
            }
        }
    }
    return undefined;
};

/**
 * Factory method to create a cloud foundry plugin.
 *
 * @see sup_main
 */
exports.newInstance = function(context, spec, secrets, cb) {

    var that = genPlug.constructor(spec, secrets);
    var $ = context;

    $.log && $.log.debug('New CF plug');

    /**
     * Tests if CAF has been deployed by CF.
     *
     * @return {boolean} True if CAF has been deployed by CF.
     *
     * @name plug_cloudfoundry#isInCloud
     * @function
     *
     */
    that.isInCloud = function() {
        return (process.env.VCAP_APPLICATION !== undefined);
    };

    /**
     * Gets the port CAF is listening to.
     *
     * @return {number} The port number used by CAF.
     *
     * @name plug_cloudfoundry#getAppPort
     * @function
     *
     */
     that.getAppPort = function() {
        return (process.env.VCAP_APP_PORT ||
                ((spec.env && spec.env.port) || 3000));
    };

    /**
     * Gets the local host name.
     *
     * @return {string} The local host name.
     *
     * @name plug_cloudfoundry#getAppHost
     * @function
     *
     */
    that.getAppHost = function() {
        return (process.env.VCAP_APP_HOST ||
                ((spec.env && spec.env.host) || 'localhost'));
    };

    /**
     * Gets the home directory.
     *
     * @return {string} The home directory.
     *
     * @name plug_cloudfoundry#getHome
     * @function
     *
     */
    that.getHome = function() {
        return (process.env.HOME ||
                ((spec.env && spec.env.home) || '/tmp'));
    };

    /**
     * Gets configuration data for a remote service.
     *
     * @param {string} typePrefix A prefix for the type of service
     * wanted, e.g., 'redis'.
     * @param {string=} name A specific name for the service or undefined.
     * @return {caf.service} Configuration data for a remote service.
     *
     * @name plug_cloudfoundry#getServiceConfig
     * @function
     *
     */
    that.getServiceConfig = function(typePrefix, name) {
        var ex;
        var result = getServiceConfig(typePrefix, name);
           /* format example for spec.env:
            *  {'redis' : { password: <string>,
            *               hostname: <string>,
            *               port: <integer>}} */
        return (result ? result : (spec.env && spec.env[typePrefix]));
    };

    cb(null, that);

};
