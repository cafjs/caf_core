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
 *  A cron job that performs bookkeeping security tasks.
 *
 * For example, cleaning caches of autenticated tokens to force re-validation.
 *
 * @name cron_security
 * @namespace
 * @augments gen_cron
 */

var genCron = require('./gen_cron');


/**
 * Factory method to create a security cron job.
 *
 * @see sup_main
 */
exports.newInstance = function(context, spec, secrets, cb) {

    var that = genCron.constructor(spec, secrets);
    var $ = context;

    // this function is bound as a method of 'that'
    that.start(function() {
                   $.log && $.log.debug('Cron ' + that.getName() +
                                        ' waking up');
                   var cb0 = function(err, data) {
                       if (err) {
                           $.log && $.log.debug('got error in pulser cron ' +
                                       err.toString());
                       } else {
                           $.log && $.log.debug('pulsing done.');
                       }
                   };
                   if ($.security_mux && $.security_mux.pulse) {
                        $.security_mux.pulse(cb0);
                   }
               });

    $.log && $.log.debug('New security cron job');
    cb(null, that);

};
