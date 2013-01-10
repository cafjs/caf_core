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
 * A dispatcher of message requests to target CAs.
 *
 * This is the last step of the message processing pipeline.
 *
 * @name plug_dispatcher
 * @namespace
 * @augments gen_plug
 */

var async = require('async');
var genPlug = require('./gen_plug');
var json_rpc = require('./json_rpc');

/**
 * Factory method to create a dispatcher of requests to CAs.
 *
 * @see sup_main
 */
exports.newInstance = function(context, spec, secrets, cb) {
    var that = genPlug.constructor(spec, secrets);
    var $ = context;

    /**
     * 'Connect' middleware setup.
     *
     * @return {function} A 'connect' middleware handler function.
     *
     * @name plug_dispatcher#connectSetup
     * @function
     *
     */
    that.connectSetup = function() {
        return function(req, res, next) {
            var caId = $.pipe.caIdFromUrl(req.originalUrl);
            var from = json_rpc.getFrom(req.body);
            var owner = $.pipe.ownerFromCaId(caId);
            var allowCreate = from && owner &&
                (owner === $.pipe.ownerFromCaId(from));
            var allowPull = allowCreate; // only owner can pull notifications
            var isBackchannel = $.pipe.isForBackchannel(req.originalUrl);
            async.waterfall(
                [
                    function(cb0) {
                        $.fact.instance(caId, {}, allowCreate, cb0);
                    },
                    function(ca, cb0) {
                        if (isBackchannel) {
                            if (allowPull) {
                                ca.pull(req.body, cb0);
                            } else {
                                var errStr = 'Backchannel pulled by non-owner ';
                                //avoid the retries of an authorization code
                                var code = json_rpc.ERROR_CODES.invalidRequest;
                                cb0(null, json_rpc.systemError(req.body, code,
                                                               errStr));
                            }
                        } else {
                            var t1 = $.profiler && $.profiler.begin();
                            var cb1 = function(err, result) {
                                if (t1) {
                                    var t2 = $.profiler.end(t1);
                                    res.setHeader('X-Response-time', t2 + 'ms');
                                }
                                cb0(err, result);
                            };
                            ca.process(req.body, cb1);
                        }
                    }
                ],
                function(error, result) {
                    if (error) {
                        if (error.remoteNode) {
                            $.uniquifier
                                .redirectToNewHost(error, req, res,
                                                   'Redirect: No longer here');
                        } else {
                            /* (error.remoteNode === null) means not found and
                             * cannot create. We use recoverable error
                             *  so that the client retries until its
                             *  owner creates it.
                             */
                            var code = (error.remoteNode === null ?
                                        json_rpc.ERROR_CODES.noSuchCA :
                                        json_rpc.ERROR_CODES.internalError);
                            var sysError =
                                json_rpc.systemError(req.body, code,
                                                     error.toString());
                            res.send(JSON.stringify(sysError));
                        }
                    } else {
                        res.send(JSON.stringify(result));
                    }
                });
        };
    };

    $.log && $.log.debug('New dispatcher plug');
    cb(null, that);
};
