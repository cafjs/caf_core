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
 *   A cron job that renews leases of local CAs that are still alive.
 *
 * @name cron_lease
 * @namespace
 * @augments gen_cron
 */

var genCron = require('./gen_cron');


/**
 * Factory method to create a lease-renewal cron job.
 *
 * @see sup_main
 */
exports.newInstance = function(context, spec, secrets, cb) {

    var that = genCron.constructor(spec, secrets);
    var $ = context;
    var renewF = function() {
        $.log && $.log.debug('Cron ' + that.getName() + ' waking up');
        var all = $.lookup.toArray();
        var alive = [];
        all.forEach(function(ca) {
                        if (ca.value.isShutdown) {
                             $.lookup.remove(ca.key);
                        } else {
                            alive.push(ca.key);
                        }
                    });
        var cb0 = function(err, gone) {
          if (err) {
              // TODO: need to retry sooner
              $.log && $.log.error('Error:cannot renew leases' + err);
          } else {
              gone.forEach(function(id) {
                               var ca = $.lookup.find(id);
                               if (ca) {
                                   $.lookup.remove(id);
                                   ca.shutdown($, function() {
                                                   var msg = 'shut down ' + id;
                                                   $.log && $.log.debug(msg);
                                               });
                               }
                           });
          }
        };
        $.lease.renewLeases(alive, cb0);
    };
    that.start(renewF);
    $.log && $.log.debug('New lease cron job');
    cb(null, that);

};
