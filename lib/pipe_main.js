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
 * Main processing pipeline for CA messages.
 * 
 * Based on express/connect middleware.
 * 
 * Configuration in framework.json:
 * 
 *     "pipe": {
 *        "module": "pipe_main",
 *        "name": "pipe",
 *        "env": {
 *           "relPublicPath" : "../../../public",
 *           "allowInsecureGET" : false
 *        }
 *      }
 * 
 *  where:
 * 
 *   -  *"relPublicPath"* is a relative directory path starting from where this 
 * file will be found at run-time (typically 
 * <yourapptopdir>/node_modules/caf_core/lib/pipe_main.js) to the
 * public directory  with your app static web pages (e.g.,
 * <yourapptopdir>/public).
 * 
 *   -  *"allowInsecureGET"* Whether we can see the internal state
 *  of a CA from a browser (dangerous!).
 * 
 *   
 * @name pipe_main
 * @namespace
 * @augments gen_pipe
 */


var express = require('express');

var genPipe = require('./gen_pipe');



/**
 * Factory method to create the main pipeline for processing messages.
 * 
 * @see sup_main
 */
exports.newInstance = function(context, spec, secrets, cb) {

    var that = genPipe.constructor(spec, secrets);
    var $ = context;
    /* Whether we can directly access the state of a CA (i.e., bypassing
     * security in debugging mode) */
    var allowInsecureGET = (spec.env && spec.env.allowInsecureGET) || false;
    that.port = $.cf.getAppPort();
    that.hostName = $.cf.getAppHost();

    /**
     * Express server instance.
     * 
     * @name pipe_main#app
     * @function
     * 
     */
    that.app = express.createServer();

    if ($.log && $.log.isActive('TRACE')) {
        that.app.use(express.logger());
    }
    that.app.use(express.bodyParser());
    if ($.security_mux) {
        $.security_mux.useConfig(that.app);
    }
    that.app.use(that.app.router);
    that.app.use(express.static(__dirname + '/' + spec.env.relPublicPath));
    that.app.use(express.static(__dirname + '/../public'));
    that.app.use(express.errorHandler({ dump: true, stack: true }));

    var uniquifierF = $.uniquifier.connectSetup();
    var dispatcherF = $.dispatcher.connectSetup();
    var dummyF = function(req, res, next) { next();};
    var securityCheckF = ($.security_mux &&
                          $.security_mux.connectSetup()) || dummyF;
    if ($.security_mux) {
        $.security_mux.routeConfig(that.app, '/login/:caId');
    }

    if ($.iot_mux) {
        $.iot_mux.routeConfig(that.app, '/iot/:deviceId');
    }
    that.app.post('/ca/:caId/:backchannel?', uniquifierF, securityCheckF,
                  function(req, res) {
                      $.log && $.log.debug('POST CA Identifier:' +
                                           req.params.caId +
                                           (req.params.backchannel ?
                                            ' for backchannel' : ''));
                      dispatcherF(req, res);
                  });
    that.app.get('/stats/:traceProfiler?', function(req, res) {
                     var report;
                     if (req.params.traceProfiler === 'startProfiling') {
                         report = ($.profiler &&
                                   $.profiler.startTraceProfiler()) || {};


                     } else if (req.params.traceProfiler === 'stopProfiling') {
                         report = ($.profiler &&
                                   $.profiler.stopTraceProfiler()) || {};

                         res.header('Content-Type', 'text/plain');
                     } else {
                         report = ($.profiler && $.profiler.report()) || {};
                     }
                     res.send(JSON.stringify(report));
                 });
    // convenience method for debugging
    that.app.get('/ping', function(req, res) {
                     res.send('Hello world from ' + that.hostName);
                 });

    //  convenience method for debugging
    // WARNING: THIS IS INSECURE!!!
    if (allowInsecureGET) {
        that.app.get('/ca/:caId', uniquifierF,  /*securityCheckF, */
                     function(req, res, next) {
                         var caId = req.params.caId;
                         var cb0 = function(err, data) {
                             if (err) {
                                 next(new Error(err.toString()));
                             } else {
                                 if (typeof data === 'string') {
                                     res.send(caId + ':' + data);
                                 } else {
                                     res.send(caId + ' not found');
                                 }
                             }
                         };
                         $.cp.getState(caId, cb0);
                     });
    }
    that.app.listen(that.port);

    /**
     * Extracts CA identifier from URL.
     * 
     * @param {string} url A URL of the form  /'ca' or 
     * 'login' followed by '/<owner>_<relative_id>/'....
     * @return {string} The CA id in URL with format <owner>_<relative_id>
     * 
     * @name pipe_main#caIdFromUrl
     * @function
     */
    that.caIdFromUrl = function(url) {
        var stripUrl = url.split('?')[0];
        var urlList = stripUrl.split('/');
        if (((urlList[1] === 'ca') || (urlList[1] === 'login')) &&
            (urlList.length >= 3)) {
            return urlList[2];
        } else {
            return undefined;
        }
    };

    /** 
     * Extracts owner from CA identifier.
     * 
     * @param {string} caId A CA id with format <owner>_<relative_id>.
     * @return {string} The owner in the CA id.
     * 
     * @name pipe_main#ownerFromCaId
     * @function
     * 
     */
    that.ownerFromCaId = function(caId) {
        var all = caId.split('_');
        if (all.length > 1) {
            return all[0];
        } else {
            return undefined;
        }
    };

    /**
     * Extracts local name from CA identifier.
     * 
     * @param {string} caId A CA id with format <owner>_<relative_id>.
     * @return {string} The local name of this CA.
     * 
     * @name pipe_main#caLocalNameFromCaId
     * @function
     */
    that.caLocalNameFromCaId = function(caId) {
        var all = caId.split('_');
        if (all.length > 1) {
            all.shift();
            return all.join('_');
        } else {
            return undefined;
        }
    };

    /**
     * Checks if it is a backchannel request.
     * 
     * @param {string} url An input URL.
     * @return {boolean} True if it is a backchannel request. 
     * 
     * @name pipe_main#isForBackchannel
     * @function
     */
    that.isForBackchannel = function(url) {
        var stripUrl = url.split('?')[0];
        var bcStr = '/backchannel';
        // stripUrl of the form <whatever>/backchannel
        return (stripUrl.indexOf(bcStr, stripUrl.length - bcStr.length) !== -1);
    };


    $.log && $.log.debug('server listening to port' + that.port);
    cb(null, that);

};
