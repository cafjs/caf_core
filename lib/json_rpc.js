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

var assert = require('assert');

/**
 * Functions to generate messages with JSON-RPC 2.0 format.
 *
 * CAF uses a subset of this spec and, for example, RPC arguments are
 * never passed by name, using instead an array.
 *
 * CAF always adds an implicit first argument to
 * requests/notifications containing meta-data, for instance:
 *
 *        {
 *           "token": string, // security token for authentication
 *           "sessionId": string,// logical session name
 *           "to": string, // target CA
 *           "from": string // source CA
 *        }
 *
 * We also add the same meta-data to replies but in this case the json-rpc reply
 * message format complicates things:
 *
 *  - *Application-level errors* use a similar approach to node.js
 * callbacks. We use an array with 3 arguments [meta, error, data] with the
 * second one using a falsy if everything went fine. This means that
 * we *NEVER* use the JSON-RPC error response object for propagating
 * application errors.
 *
 *  - *System-level errors* (e.g., non-parsable JSON or missing target
 * CA) do use the error response object using exports.ERROR_CODES. In that
 * case we use a tuple (i.e., array) in the data field to add the meta-data,
 * i.e., { "error": {"data": [meta, extraData]}}.
 *
 * Use provided getters and setters to hide this complexity.
 *
 *
 * @module json_rpc
 */

/** Enum with error codes. */
var ERROR_CODES = exports.ERROR_CODES = {
    parseError: -32700,
    invalidRequest: -32600,
    methodNotFound: -32601,
    invalidParams: -32602,
    internalError: -32603,
    //-32000 to -32099 for implementation-defined server-errors
    noSuchCA: -32000,
    shutdownCA: -32001,
    checkpointFailure: -32002,
    prepareFailure: -32003,
    exceptionThrown: -32004,
    commitFailure: -32005,
    forceRedirect: -32006,
    notAuthorized: -32007
};

/** Default ID in requests that come from entities that have no proper
 id */
var DEFAULT_FROM_ID = exports.DEFAULT_FROM_ID = '-2';
/** Default token with no authentication. */
var DUMMY_TOKEN = exports.DUMMY_TOKEN = 'INVALID_2';

/** Reserved session id for internal, local sessions.*/
exports.SYSTEM_SESSION_ID = '-1';
/** Reserved from id for internal, local sessions.*/
var SYSTEM_FROM_ID = exports.SYSTEM_FROM_ID = '-1';
/** Reserved username for internal, local sessions.*/
var SYSTEM_USERNAME = exports.SYSTEM_USERNAME = '#system#';
/** Reserved username_fromid for internal, local sessions.*/
exports.SYSTEM_FROM = SYSTEM_USERNAME + '_' + SYSTEM_FROM_ID;

/** Reserved token  for internal, local sessions.*/
exports.SYSTEM_TOKEN = 'INVALID_TOKEN';

/** Generate a random string.
 * @function
 */
var randomId = exports.randomId = function() {
    var unique = Math.floor(Math.random() * 10000000000000000);
    var result = '' + (new Date()).getTime() + unique;
    return result;
};

/** Tests if it is a notification message.
 * @function
 */
var isNotification = exports.isNotification = function(msg) {

    return (msg && (msg.jsonrpc === '2.0') &&
             (msg.method) &&
             (msg.params && msg.params.length > 0) &&
             (!msg.id));
};

/** Creates notification message.
 * @function
 */
var notification = exports.notification = function(to, from, sessionId,
                                                   methodName, var_args) {

    var argsArray = Array.prototype.slice.call(arguments);
    argsArray.splice(0, 4);
    var firstArg = {'sessionId' : sessionId, 'to' : to, 'from' : from};
    argsArray.unshift(firstArg);
    return {
        'jsonrpc': '2.0',
        'method' : methodName,
        'params' : argsArray
    };
};

/** Tests if it is a request message.
 * @function
 */
var isRequest = exports.isRequest = function(msg) {

    return (msg && (msg.jsonrpc === '2.0') &&
            (msg.method) &&
            (msg.params && msg.params.length > 0) &&
            (msg.id));
};

/** Creates a request message.
 * @function
 */
exports.request = function(token, to, from, sessionId, methodName, var_args) {
    var argsArray = Array.prototype.slice.call(arguments);
    argsArray.shift(); // get rid of token
    var result = notification.apply(notification, argsArray);
    result.id = randomId();
    setToken(result, token);
    return result;
};

/** Tests if it is an application reply message.
 * @function
 */
var isAppReply = exports.isAppReply = function(msg) {

    return (msg && (msg.jsonrpc === '2.0') &&
            (msg.result && (msg.result.length === 3)) &&
            (msg.id));
};

var newReplyMeta = function(request) {
    return {
        'token' : getToken(request),
        'sessionId' : getSessionId(request),
        'to' : getFrom(request),
        'from' : getTo(request)
    };
};

/**
 * Creates an application reply message.
 * @function
 *
 */
var appReply = exports.appReply = function(request, error, value) {
    return {
        'jsonrpc': '2.0',
        'result' : [newReplyMeta(request), error, value],
        'id': request.id
    };
};

/** Tests if it is a system error message.
 * @function
 */
var isSystemError = exports.isSystemError = function(msg) {
    return (msg && (msg.jsonrpc === '2.0') &&
            (msg.error && msg.error.code) &&
            (msg.error.data) && (msg.error.data.length === 2) &&
            (msg.id));
};

/** Creates a system error message.
 * @function
 */
var systemError = exports.systemError = function(request, code, msg, data) {
    var errorMsg = {
        'code' : code,
        'message' : msg,
        'data' : [newReplyMeta(request), data]
    };
    return {
        'jsonrpc': '2.0',
        'error' : errorMsg,
        'id': request.id
    };
};

/** Checks if it there is a recoverable error in message.
 * @function
 */
var isErrorRecoverable = exports.isErrorRecoverable = function(msg) {
    var code = getSystemErrorCode(msg);
    // Non-deterministic errors or specific to a particular node
    return ((code === ERROR_CODES.noSuchCA) ||
            (code === ERROR_CODES.shutdownCA) ||
            (code === ERROR_CODES.checkpointFailure) ||
            (code === ERROR_CODES.prepareFailure) ||
            (code === ERROR_CODES.commitFailure) ||
            (code === ERROR_CODES.internalError));

};

/** Creates a reply message.
 * @function
 */
exports.reply = function(request, error, value) {
    if (isSystemError(error)) {
        if (error.id === request.id) {
            // already wrapped in call()
            return error;
        } else {
            assert.ok(false, 'BUG:Reply error ' + JSON.stringify(error) +
                      ' not matching id in request ' +
                      JSON.stringify(request));
            return null; // not reached
        }
    } else {
        return appReply(request, error, value);
    }
};

/** Creates a redirect message.
 * @function
 */
exports.redirect = function(request, msg) {
    return systemError(request, ERROR_CODES.forceRedirect, msg);

};

/** Tests if it is a redirect message.
 * @function
 */
exports.isRedirect = function(msg) {
    return (isSystemError(msg) &&
            (getSystemErrorCode(msg) === ERROR_CODES.forceRedirect));
};

/** Checks if it is a "not authorized" message.
 * @function
 */
exports.isNotAuthorized = function(msg) {
    return (isSystemError(msg) &&
            (getSystemErrorCode(msg) === ERROR_CODES.notAuthorized));
};

/** Executes a method in a target CA  using arguments in an RPC
 request message.
 * @function
 */
exports.call = function(msg, target, cb) {

    var error;
    if (typeof target !== 'object') {
        error = systemError(msg, ERROR_CODES.noSuchCA, 'CA not found');
    }
    if ((!error) && !(isRequest(msg) || isNotification(msg))) {
        error = systemError(msg, ERROR_CODES.invalidRequest, 'Invalid request');
    }
    if ((!error) && (typeof target[msg.method] !== 'function')) {
        error = systemError(msg, ERROR_CODES.methodNotFound,
                            'method not found');
    }
    if (!error) {
        try {
            var args = msg.params.slice(0);
            args.shift(); // get rid of meta-data
            args.push(cb);
            target[msg.method].apply(target, args);
        } catch (x) {
            error = systemError(msg, ERROR_CODES.invalidParams,
                                'Invalid params', x.toString());
            cb(error);
        }
    } else {
        cb(error);
    }
};

/** Gets original method arguments from message.
 * @function
 */
exports.getMethodArgs = function(msg) {
    if (isRequest(msg) || isNotification(msg)) {
        return msg.params && msg.params.slice(1);
    } else {
        return undefined;
    }

};

/** Freezes meta-data in message.
 * @function
 */
exports.metaFreeze = function(msg) {

    Object.freeze(msg);
    if (isNotification(msg) || isRequest(msg)) {
        Object.freeze(msg.params);
        Object.freeze(msg.params[0]);
    } else if (isAppReply(msg)) {
        Object.freeze(msg.result);
        Object.freeze(msg.result[0]);
    } else if (isSystemError(msg)) {
        Object.freeze(msg.error);
        Object.freeze(msg.error.data);
        Object.freeze(msg.error.data[0]);
    } else {
        assert.ok(false, 'Freezing  badly defined msg ' +
                  JSON.stringify(msg));
    }
};

/** Gets meta-data from message.
 * @function
 */
var getMeta = exports.getMeta = function(msg) {
    if (isRequest(msg) || isNotification(msg)) {
        return msg.params[0];
    } else if (isAppReply(msg)) {
        return msg.result[0];
    } else if (isSystemError(msg)) {
        return msg.error.data[0];
    } else {
        return undefined;
    }
};

/** Sets meta-data in message.
 * @function
 */
var setMeta = exports.setMeta = function(msg, meta) {
    if (isRequest(msg) || isNotification(msg)) {
        msg.params[0] = meta;
    } else if (isAppReply(msg)) {
        msg.result[0] = meta;
    } else if (isSystemError(msg)) {
        msg.error.data[0] = meta;
    } else {
        assert.ok(false, 'Setting meta in a badly defined msg ' +
                  msg.toString());
    }
};

/** Gets token from meta-data in message.
 * @function
 */
var getToken = exports.getToken = function(msg) {
    var meta = getMeta(msg);
    return (meta ? meta.token : undefined);
};

/** Gets session id from meta-data in message.
 * @function
 */
var getSessionId = exports.getSessionId = function(msg) {
    var meta = getMeta(msg);
    return (meta ? meta.sessionId : undefined);
};

/** Gets target CA  from meta-data in message.
 * @function
 */
var getTo = exports.getTo = function(msg) {
    var meta = getMeta(msg);
    return (meta ? meta.to : undefined);
};

/** Gets source CA  from meta-data in message.
 * @function
 */
var getFrom = exports.getFrom = function(msg) {
    var meta = getMeta(msg);
    return (meta ? meta.from : undefined);
};


/** Gets error field from application reply message.
 * @function
 */
var getAppReplyError = exports.getAppReplyError = function(msg) {
    return (isAppReply(msg) ? msg.result[1] : undefined);
};

/** Gets data field from application reply message.
 * @function
 */
var getAppReplyData = exports.getAppReplyData = function(msg) {
    return (isAppReply(msg) ? msg.result[2] : undefined);
};

/** Gets system error data from message.
 * @function
 */
var getSystemErrorData = exports.getSystemErrorData = function(msg) {
     return (isSystemError(msg) ? msg.error.data[1] : undefined);
};

/** Gets system error code from message.
 * @function
 */
var getSystemErrorCode = exports.getSystemErrorCode = function(msg) {
     return (isSystemError(msg) ? msg.error.code : undefined);
};

/** Gets system error msg from message.
 * @function
 */
var getSystemErrorMsg = exports.getSystemErrorMsg = function(msg) {
     return (isSystemError(msg) ? msg.error.message : undefined);
};

/** Sets source CA in message meta-data.
 * @function
 */
var setFrom = exports.setFrom = function(msg, from) {
    var meta = getMeta(msg) || {};
    meta.from = from;
    setMeta(msg, meta);
};

/** Sets target CA in message meta-data.
 * @function
 */
var setTo = exports.setTo = function(msg, to) {
    var meta = getMeta(msg) || {};
    meta.to = to;
    setMeta(msg, meta);
};

/** Sets session id in message meta-data.
 * @function
 */
var setSessionId = exports.setSessionId = function(msg, sessionId) {
    var meta = getMeta(msg) || {};
    meta.sessionId = sessionId;
    setMeta(msg, meta);
};

/** Sets token in message meta-data.
 * @function
 */
var setToken = exports.setToken = function(msg, token) {
    var meta = getMeta(msg) || {};
    meta.token = token;
    setMeta(msg, meta);
};
