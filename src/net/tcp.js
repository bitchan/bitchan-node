/**
 * TCP networking.
 * Basically it almost fully copies PyBitmessage behavior to be more
 * compatible with the rest of network.
 */

import TcpTransport from "bitmessage/lib/net/tcp";
import conf from "../config";
import * as storage from "../storage";
import {DEFAULT_STREAM, MY_SERVICES, MY_USER_AGENT, log} from "./common";

const logDebug = log("TCP", "debug");
const logInfo = log("TCP", "info");

export function init() {
  return new Promise(function(resolve) {
    // TODO(Kagami): Hardcode stream to connect to by default. We may
    // need better stream support in future.
    runOutcomingLoop({stream: DEFAULT_STREAM, limit: getOutcomingLimit()});
    if (!conf.get("tcp-trusted-peer")) {
      listenIncoming({
        stream: DEFAULT_STREAM,
        host: conf.get("tcp-host"),
        port: conf.get("tcp-port"),
      });
    }
    resolve();
  });
}

// Dictionary of connected/half-open transports accessed by IP.
const connected = {};
// Number of outcoming connections.
let outcomingNum = 0;

// Return whether the given host is already connected/half-open.
function isConnected(host) {
  return Object.prototype.hasOwnProperty.call(connected, host);
}

// Return limit of outcoming connections.
function getOutcomingLimit() {
  return conf.get("tcp-trusted-peer") ? 1 : 8;
}

// Return a promise that contains random known node.
function getNode(stream) {
  let trustedPeer = conf.get("tcp-trusted-peer");
  if (trustedPeer) {
    return Promise.resolve({
      host: trustedPeer[0],
      port: trustedPeer[1],
    });
  } else {
    // TODO(Kagami): Attempted connections list.
    let exclude = Object.keys(connected);
    return storage.knownNodes.getRandom(null, stream, exclude);
  }
}

function createTransport() {
  return new TcpTransport({
    services: MY_SERVICES,
    userAgent: MY_USER_AGENT,
    port: conf.get("tcp-port"),
  });
}

function runOutcomingLoop(opts) {
  if (outcomingNum >= opts.limit) {
    return setTimeout(runOutcomingLoop, 100, opts);
  }

  getNode(opts.stream).then(function({host, port}) {
    // Check whether we are already connected to the returned node's
    // host once more time (`getNode` also filters connected nodes) to
    // protect ourself against race condition because of async SQL
    // query.
    if (!isConnected(host)) {
      logInfo("Connecting to %s:%s", host, port);
      let transport = createTransport();
      outcomingNum++;
      transport.on("close", function() {
        outcomingNum--;
      });
      setupTransport({transport, host, port});
      // transport.connect(port, host);
    }
    setTimeout(runOutcomingLoop, 100, opts);
  }).catch(function(err) {
    let msg = "Failed to find node to connect (%s), sleeping for 3 seconds";
    logDebug(msg, err.message);
    setTimeout(runOutcomingLoop, 3000, opts);
  });
}

function listenIncoming(opts) {
  let server = createTransport();
  server.on("connection", function(transport, host, port) {
    logInfo("Got new connection from %s:%s", host, port);
    if (isConnected(host)) {
      logInfo("We are already connected to %s, closing connection", host);
      transport.close();
      return;
    }
    setupTransport({transport, host, port});
  });
  server.listen(opts.port, opts.host);
  logInfo("Listening at %s:%s", opts.host, opts.port);
}

function logConnInfo() {
  let allNum = Object.keys(connected).length;
  logDebug("Total %s connection(s) (%s outcoming)", allNum, outcomingNum);
}

// Setup event handlers for a new incoming/outcoming connection.
function setupTransport({transport, host, port}) {
  connected[host] = transport;
  logConnInfo();
  transport.on("close", function() {
    logInfo("Connection to %s:%s was closed", host, port);
    delete connected[host];
    logConnInfo();
  });
}
