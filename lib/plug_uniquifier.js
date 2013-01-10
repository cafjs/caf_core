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
 * A protocol handler to guarantee that CAs are unique in the data center.
 *
 *
 * @name plug_uniquifier
 * @namespace
 * @augments gen_plug
 */

/*
 This module relies on Cloud Foundry style http routing, i.e.,:
 there could be several DEAs (Droplet Execution Agents) (i.e., node.js
processes) that could fulfill an application request. Each DEA is identified
by a hostname/port  pair. Routing is based on the url (that identifies the
application) and an optional VCAP  cookie that contains the destination DEA
host/port (encrypted). When there is no cookie CF selects  one destination at
random from a set of DEAs hosting that application. If the VCAP  cookie is
present it decrypts it and tries to use it as its destination; if it fails it
defaults to the randomized strategy. If the node.js application response has
a jsessionid cookie, CF will respect that session by setting the VCAP cookie
to that node host/port, i.e., all future requests in that session (assuming no
failures) will be routed to that DEA.


 Our strategy to guarantee uniqueness of CAs in this context is as follows:

 First, within a single node.js process we just maintain a consistent directory
(plug_lookup) that is used to route all local requests.

 Second, at a global level we use a lease-based directory for binding (unique)
CA ids to DEAs (encrypted cookies with host/port). If a node fails it stops
renewing the lease and the binding eventually dissapears, allowing another
node to take over that CA.

 Third, the checkpointing service  always ensures that nobody else has the lease
before commiting permanent state changes on behalf of a CA. Otherwise, the CA
will shut down and its entry in the local directory will get deleted.
We always checkpoint before externalizing any changes and this guarantees
serializability.

There are a few complications:

 - At start-up a node does not know its own VCAP cookie because cookies are
encrypted by CF. Therefore, it cannot safely commit state changes until it
discovers its VCAP cookie. To discover  it  we force our first client to
retry after we set a random session cookie. This forces CF to attach our VCAP
to the response, and the new request will be routed back to this node with
both cookies. If the random session cookie matches we have a greater
confidence that it is our own VCAP and not the one of other failed (and
randomly routed) request.

- If there is a node failure the system will keep on retrying until
the lease expires and each retry will get randomly routed to a different DEA.
To avoid wasting resources either clients should throttle retries and/or the
lease timeout should be small.

-If there is a CA failure we rely on the node process to fix the problem (i.e.,
 shut it down and recreate it from a checkpoint) so retries will be routed to
 the same node. However, if a node process cannot fix the problem (i.e.,
cannnot access the checkpointing service) it should exit to enable the request
 to be routed to a different node by CF.

-We want to eliminate performance hot spots by migrating CAs to other nodes.
The strategy is to just kill the node process and allow its CAs to be
randomly spread to other nodes after leases expire. Again, this could create
busy transients due to failed retries...
*/


var genPlug = require('./gen_plug');
var json_rpc = require('./json_rpc');
var cookies = require('./cookies');

/* Cookie name used by Cloud Foundry*/
var VCAP_ID_NAME = '__VCAP_ID__';
/* Cookie name to link future interactions to this instance.*/
var JSESSIONID_NAME = 'jsessionid';

var redirect = function(req, res, msg) {
    var redir = json_rpc.redirect(req.body, msg);
    res.send(JSON.stringify(redir));
};

/**
 * Factory method to create a protocol handler to uniquify CAs.
 *
 *  @see sup_main
 */
exports.newInstance = function(context, spec, secrets, cb) {

    var that = genPlug.constructor(spec, secrets);
    var $ = context;
    /* Setting spec.env.nodeId is only for debugging. nodeId is only
     available at run-time when CAF runs under Cloud Foundry */
    var nodeId = spec.env && spec.env.nodeId;

    var discoveryToken = json_rpc.randomId();
    var discoveryCookie = cookies.constructor({'name' : JSESSIONID_NAME,
                                               'value' : discoveryToken});
    var cookieJar = cookies.newCookieJar(discoveryCookie);

    /**
     * Gets a unique identifier for the current node.js process.
     *
     * @return {string} An identifier for the current node.js process.
     *
     * @name plug_uniquifier#getNodeId
     * @function
     */
    that.getNodeId = function() {
      return nodeId;
    };

    /**
     * Forces the client to retry,  adding a cookie to the response that guides
     * the new request to the correct node.
     *
     * @param {{remoteNode: string}} newNode A remote node location that
     * should handle this request.
     * @param {Object} req An http request.
     * @param {Object} res An http response.
     * @param {string} msg A redirection message.
     *
     * @name plug_uniquifier#redirectToNewHost
     * @function
     */
    that.redirectToNewHost = function(newNode, req, res, msg) {
        var otherC = cookies.constructor({'name' : VCAP_ID_NAME,
                                          'value' : newNode.remoteNode});
        var otherCookieJar = cookies.newCookieJar(otherC);
        res.header('Set-Cookie', otherCookieJar.toHeader());
        redirect(req, res, msg);
    };

    /**
     * 'Connect' middleware setup.
     *
     * @return {function} A 'connect' middleware handler function.
     *
     * @name plug_uniquifier#connectSetup
     * @function
     *
     */
    that.connectSetup = function() {
        return function(req, res, next) {
            var reqCookieJar = cookies.parseCookies(req.headers.cookie);
            var reqSession = reqCookieJar[JSESSIONID_NAME] &&
                reqCookieJar[JSESSIONID_NAME].value;
            var reqVcap = reqCookieJar[VCAP_ID_NAME] &&
                reqCookieJar[VCAP_ID_NAME].value;
            var caId = $.pipe.caIdFromUrl(req.originalUrl);

            var nextWithId = function(isNewNodeId) {
                //ignore padding, don't assume we own it if fresh nodeId
                if ((nodeId.indexOf(reqVcap) !== 0) || isNewNodeId) {
                    /* VCAP cookie not ours, try to grab lease or redirect to
                     *  owner*/
                    var cb = function(err) {
                        if (err) {
                            // err contains the VCAP id of the current owner
                            that.redirectToNewHost(err, req, res,
                                                   'Redirect: Not here');
                        } else {
                            // we own it now
                            res.header('Set-Cookie', cookieJar.toHeader());
                            next();
                        }
                    };
                    $.lease.grabLease(caId, cb);
                } else {
                    /* Assume we still own it, a safety check is always done at
                     * commit time.  The client is responsible for retrying if
                     * it gets a shutdownCA error back.
                     */
                    next();
                }
            };
            if (!nodeId) {
                // nodeId undefined use discovery protocol
                if ((reqSession === discoveryToken) && reqVcap) {
                    nodeId = reqVcap;
                    nextWithId(true);
                } else {
                    res.header('Set-Cookie', cookieJar.toHeader());
                    /* jsessionid cookie will force cloud foundry to
                     * route the repeated request to this node, but this time
                     *  disclosing our real VCAP cookie in the header.
                     */
                    redirect(req, res, 'Redirect: Don\'t know my nodeId');
                }
            } else {
                nextWithId(false);
            }
        };
    };
    $.log && $.log.debug('New uniquifier plug');

    cb(null, that);
};
