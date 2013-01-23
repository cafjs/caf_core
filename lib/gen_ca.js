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
 * Generic Cloud Assistant.
 *
 *
 * @name gen_ca
 * @namespace
 * @augments gen_container
 */

var async = require('async');
var genContainer = require('./gen_container');
var json_rpc = require('./json_rpc');
var assert = require('assert');

try {
var domain = require('domain'); // >= 0.8.1
} catch (err) {
    console.log('WARNING: domains are not supported');
}

/**
 * Constructor method for a generic CA.
 *
 * @see gen_component
 *
 */
exports.constructor = function(spec, secrets) {

    var that = genContainer.constructor(spec, secrets);

    /** Children that implement a transactional interface */
    var transChildren = [];

    /**
     * Run-time type information.
     *
     * @type {boolean}
     * @name gen_ca#isCA
     */
    that.isCA = true;

    var messagesProcessed = 0;

    var lastMessagesProcessed = -1;

    var super_createChildren = that.superior('createChildren');
    that.createChildren = function(childSpecs, context, env,
                                   secrets, override, cb) {
        var cb0 = function(err, data) {
            if (err) {
                cb(err);
            } else {
                transChildren = that.getChildren().
                    filter(function(child) {
                               return child.isTransactional;
                           });
                setupInQueue(context);
                cb(err, data);
            }
        };
        super_createChildren(childSpecs, context, env,
                             secrets, override, cb0);
    };


    var mapTransChildren = function(f, cb) {
        async.map(transChildren, f, cb);
    };

    var mapSeriesTransChildren = function(f, cb) {
        async.mapSeries(transChildren, f, cb);
    };

    var mapToObject = function(results) {
        var object = {};
        for (var i = 0; i < results.length; i++) {
            if ((results[i] !== null) && (results[i] !== undefined)) {
                object[transChildren[i].getName()] = results[i];
            }
        }
        return object;
    };

    var newState = function(str) {
        if (typeof str === 'string') {
            return JSON.parse(str);
        } else {
            return null;
        }
    };

    var dumpState = function(map) {
        if (Array.isArray(map)) {
            return JSON.stringify(mapToObject(map));
        } else {
            return null;
        }
    };

    /**
     * Initializes the state of this CA from scratch.
     *
     * This method is called by CAF only once (when the CA is created).
     *
     * @param {caf.cb} cb A callback to continue after initialization.
     *
     * @name gen_ca#init
     * @function
     *
     */
    that.init = function(cb) {
        var initF = function(child, cb0) {
            child.__ca_init__.apply(child, [cb0]);
        };
        mapSeriesTransChildren(initF, cb);
    };

    /**
     * Initializes the state of this CA from a previous checkpoint.
     *
     * This method can be called by CAF many times, for example, after
     * recovering  from a failure or to enable migration.
     *
     * @param {Object} cp The last checkpoint of the state of this CA.
     * @param {caf.cb} cb A callback to continue after resuming.
     *
     * @name gen_ca#resume
     * @function
     */
    that.resume = function(cp, cb) {
        var cpObj = newState(cp) || {};
        var resumeF = function(child, cb0) {
            var cp = cpObj[child.getName()];
            var cpParsed = cp && JSON.parse(cp);
            child.__ca_resume__.apply(child, [cpParsed, cb0]);
        };
        mapSeriesTransChildren(resumeF, cb);
    };

    var begin = function(msg, cb) {
         var beginF = function(child, cb0) {
            child.__ca_begin__.apply(child, [msg, cb0]);
        };
        mapTransChildren(beginF, cb);
    };

    var prepare = function(cb) {
        var cb0 = function(err, value) {
            if (err) {
                cb(err);
            } else {
                cb(err, dumpState(value));
            }
        };
        var prepareF = function(child, cb1) {
            child.__ca_prepare__.apply(child, [cb1]);
        };
        mapTransChildren(prepareF, cb0);
    };

    var commit = function(cb) {
         var commitF = function(child, cb0) {
             child.__ca_commit__.apply(child, [cb0]);
         };
        mapTransChildren(commitF, cb);
    };

    var abort = function(cb) {
         var abortF = function(child, cb0) {
             child.__ca_abort__.apply(child, [cb0]);
         };
        mapTransChildren(abortF, cb);
    };

    /* Three different ways of stopping a CA: terminate, shutdown and destroy.
     *
     *  Terminate is the nicest one, scheduling a message first that will call
     * a  custom method in the object (__ca__terminate__), checkpoint this
     * new state and then force a shutdown before any other message gets
     * processed.
     *
     * Shutdown ignores the current running state of the CA and does not
     * checkpoint or call any methods. It is what you need when the CA is
     * hanged (or in a known already checkpointed state as with Terminate).
     * No new checkpoints, processed messages or pulled session messages
     * should occur  after shutdown. Shutdown CAs eventually get
     * removed from the lookup service and GC.
     *
     * Destroy is a shutdown that also deletes any permanent state associated
     * with it. Restarting a CA with the same id just means a fresh new CA.
     *
     * The system (cron_ripper) detects hanged CAs and shuts them down, so it
     * is safe to always try to terminate (nicely) a CA because if termination
     * hangs eventually the ripper will clean up the mess.
     *
     */


    /**
     * Destroys this CA permanently by deleting its (checkpointed) state.
     *
     * Destroyed CAs cannot be resumed and input/output queues are immediately discarded.
     *
     * @param {Object} ctx A context to unregister this CA.
     * @param {caf.cb} cb A callback function to continue after clean-up.
     *
     * @name gen_ca#destroy
     * @function
     */
    that.destroy = function(ctx, cb) {
        var $ = ctx;
        async.waterfall(
            [
                function(cb0) {
                    that.shutdown($, cb0);
                },
                function(ca, cb0) {
                    $.cp.deleteState(that.getName(), cb0);
                }
            ],
            function(error, data) {
                if (error) {
                    $.log && $.log.error('Cannot delete state');
                    cb(error);
                } else {
                    cb(error, data);
                }
            });
    };


    /**
     * Terminates nicely this CA.
     *
     * The CA method  `__ca_terminate__` is called and the new state
     * checkpointed. Terminated CAs can be restored from checkpoints
     * in a transparent manner, possibly in a different node.
     *
     *
     * @param {Object} ctx A context to unregister this CA.
     * @param {caf.cb} cb A callback function to continue after clean-up.
     *
     * @name gen_ca#terminate
     * @function
     */
    that.terminate = function(ctx, cb) {
        var $ = ctx;
        var cb0 = function(error, data) {
            if (error) {
                $.log && $.log.error('cannot terminate cleanly' + error);
            }
            // always shutdown, ignore error
            that.shutdown(ctx, cb);
        };
        var msg = json_rpc.request(json_rpc.SYSTEM_TOKEN,
                                   that.getName(),
                                   json_rpc.SYSTEM_FROM,
                                   json_rpc.SYSTEM_SESSION_ID,
                                   '__ca_terminate__');
        that.process(msg, cb0);
    };

    /**
     * Queues a message to be processed by this CA.
     *
     * @param {Object} msg A message to be processed.
     * @param {caf.cb} cb A callback function to continue after
     * processing the message and to propagate a response to the caller.
     *
     *
     * @name gen_ca#process
     * @function
     */
    that.process = function(msg, cb) {
        if ((that.isShutdown) || (!that.$.inqMgr)) {
            cb(json_rpc.systemError(msg, json_rpc.ERROR_CODES.shutdownCA,
                                    'CA ' + that.getName() + ' shutdown0'));
        } else {
            that.$.inqMgr.process(msg, cb);
        }
    };

    /**
     * Checks for progress processing messages.
     *
     * CAF detects hanged CAs and shuts them down.
     *
     * @see cron_ripper
     *
     * @return {boolean} True if message queue is empty or at least one
     * message was processed since the last call to `progress`.
     *
     *
     * @name gen_ca#progress
     * @function
     */
    that.progress = function() {
        var result = true;
        if ((messagesProcessed === lastMessagesProcessed) &&
            (that.$.inqMgr.getQueue().length() > 0)) {
                result = false;
        }
        lastMessagesProcessed = messagesProcessed;
        return result;
    };


    /**
     * Queues a pulse message for this CA to enable autonomous
     * computation.
     *
     * @param {caf.cb} cb A callback function to continue after
     * processing the pulse message.
     *
     * @see cron_pulser
     *
     * @name gen_ca#pulse
     * @function
     */
    that.pulse = function(cb) {
        var msg = json_rpc.request(json_rpc.SYSTEM_TOKEN,
                                   that.getName(),
                                   json_rpc.SYSTEM_FROM,
                                   json_rpc.SYSTEM_SESSION_ID,
                                   '__ca_pulse__');
        that.process(msg, cb);
    };


    /**
     * Polls for pending notification messages.
     *
     * @param {Object} request A notification request message.
     * @param {caf.cb} cb A callback called when there is a new
     * notification message (or timeout).
     *
     * @name gen_ca#pull
     * @function
     */
    that.pull = function(request, cb) {
        that.$.session_ca && that.$.session_ca.pull(request, cb);
    };


    /**
     * wrapF takes (error,data) -> newError
     */
    var wrapSystemError = function(msg, code, errorStr, cb) {
        return function(error, data) {
            if (error) {
                var newError =
                    json_rpc.systemError(msg, code, errorStr + ' ' +
                                         error.toString(), error);
                cb(newError, data);
            } else {
                cb(error, data);
            }
        };
    };

    /* Errors during msg processing can come from:
     *  1) An exception thrown during its processing.
     *  2) An error argument returned in the call method callback
     *  3) An error argument in any of the other callbacks in the pipeline.
     *
     * The general strategy to deal with errors is as follows:
     *  a) Try to roll back the transaction by doing abort
     *  b) If abort fails do a shutdown of the CA
     *  c) If shutdown fails exit node.js .
     *
     * In terms of notifying the client we use the following strategy:
     *  In case (*, c) do nothing, just die.
     *  In case  (*,b) return a shutdownCA system error message logging the
     * source of the error in the 'message' field.
     *
     *  In case (1,a) treat it a system level error using exceptionThrown.
     *  We treat the same the call method and internal components.
     * We want to encourage application/system code to not let propagate
     * errors that way, and catch them and convert them to type 2). The carrot
     *  is that they get better reporting as we will see next...
     *
     *  In case (2,a) treat it as an application level error
     * (i.e., json_rpc.appReply), this means using a tuple (i.e., array) with
     * error/data in the result field to encode node.js callback semantics.
     * Note that this is all transparent to json-rpc or node.js error callbacks
     * in the server, after rollback within the framework there was no error!
     *
     *  In case (3,a) treat it as a system level error: if checkpoint failed
     * use checkpointFailure, if any of the sub-systems returned an error in
     * the prepare phase use prepareFailure, and so on...
     *
     */
    var handleError = function(that, msg, error, value, exception, cb) {
        var cb1 = function(err, data) {
          if (err) {
              // shutdown failed
              process.exit(1);
          } else {
              var newMsg = (exception ? exception.toString() :
                            (error ? error.toString() : null));
              cb(null, json_rpc.systemError(msg,
                                            json_rpc.ERROR_CODES.shutdownCA,
                                            newMsg));
          }
        };
        var cb0 = function(err0, data0) {
            if (err0) {
                /* Exception while aborting, cannot safely
                 * continue since state is corrupt. Shutdown
                 * and pray...
                 */
                that.shutdown({}, cb1);
            } else {
                if (exception) {
                    cb(null, json_rpc.systemError(msg,
                                                  json_rpc.ERROR_CODES.
                                                  exceptionThrown,
                                                  exception.toString()));
                } else {
                    assert.ok(json_rpc.isAppReply(error) ||
                              json_rpc.isSystemError(error),
                              'not app/system error reply' + error.toString());
                    cb(null, error);
                }
            }
        };
        var sysError = json_rpc.getSystemErrorCode(error);
        if ((sysError === json_rpc.ERROR_CODES.commitFailure) ||
            (sysError === json_rpc.ERROR_CODES.checkpointFailure)) {
            /* Error while committing or persisting the commit decision.
             Cannot abort. Force a CA shutdown. When this CA recovers from
             the checkpoint, if the commit decision made it to persistent
             storage it will redo the commit actions (assumed idempotent).

             This is much safer than assuming  checkpointFailure means did not
             make it to storage. If that's not the case and we abort and
             immediately (i.e., before the next message) the CA crashes and
             recovers, the recovered CA will think that the transaction
             committed when it was really aborted.
             */
            that.shutdown({},cb1);
        } else {
            abort(cb0);
        }
    };

    // domains may trigger multiple error calls
    var callJustOnce = function(context, cb) {
        var $ = context;
        var alreadyCalled = false;
        return function(err, data) {
            if (alreadyCalled) {
                $.log && $.log.debug('callJustOnce: Calls >1: err:' +
                                     JSON.stringify(err) + ' data:' +
                                     JSON.stringify(data));
            } else {
                alreadyCalled = true;
                cb(err, data);
            }
        };
    };

    var setupInQueue = function(context) {
        var callResponse;
        var $ = context;
        var f = function(msg, cbTop) {
            var cb = callJustOnce($, cbTop);
            var dom = domain && domain.create();
            dom && dom.on('error', function(err) {
                              $.log && $.log.debug('got exception in queue' +
                                                   err.toString());
                              dom.dispose();
                              handleError(that, msg, undefined, undefined, err,
                                          cb);
                          });
            var mainF = function()  {
                json_rpc.metaFreeze(msg);//to trust meta-data after user methods
                async.waterfall(
                    [
                        function(cb0) {
                            messagesProcessed = messagesProcessed + 1;
                            begin(msg, cb0);
                        },
                        function(ignore, cb0) {
                            if (that.isShutdown) {
                                // CA shutdown, abort
                                cb0(json_rpc.
                                    systemError(msg,
                                                json_rpc.ERROR_CODES.shutdownCA,
                                                'CA ' + that.getName() +
                                                ' shutdown1'));
                            } else {
                                var cb1 = function(error, data) {
                                    var reply = (json_rpc.isNotification(msg) ?
                                                 null :
                                                 json_rpc.reply(msg, error,
                                                                data));
                                    if (error) {
                                        cb0(reply, null);
                                    } else {
                                        cb0(null, reply);
                                    }
                                };
                                // call method
                                json_rpc.call(msg, that.$.handler, cb1);
                            }
                        },
                        function(response, cb0) {
                            // prepare
                            callResponse = response;
                            var cb1 = wrapSystemError(
                                msg, json_rpc.ERROR_CODES.prepareFailure,
                                'prepareFailed ' + that.getName(), cb0);
                            prepare(cb1);
                        },
                        function(snap, cb0) {
                            // update state
                            var cb1 = wrapSystemError(
                                msg, json_rpc.ERROR_CODES.checkpointFailure,
                                'updateState ' + that.getName(), cb0);
                            $.cp.updateState(that.getName(), snap, cb1);
                        },
                        function(ignore, cb0) {
                            // commit
                            var cb1 = wrapSystemError(
                                msg, json_rpc.ERROR_CODES.commitFailure,
                                'commitFailure ' + that.getName(), cb0);
                            commit(cb1);
                        }
                    ],
                    function(error, data) {
                        if (error) {
                            handleError(that, msg, error, data, undefined, cb);
                        } else {
                            cb(null, callResponse);
                        }
                    });
            };
            (dom ? dom.run(mainF) : mainF());
        };
        that.$.inqMgr.newQueue(f);
    };

    return that;
};
