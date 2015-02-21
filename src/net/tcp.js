/**
 * TCP networking.
 * Basically it almost fully copies PyBitmessage behavior to be more
 * compatible with the rest of network.
 */

import bitmessage from "bitmessage";
import TcpTransport from "bitmessage/lib/net/tcp";
import conf from "../config";
import * as storage from "../storage";
import {DEFAULT_STREAM, MY_SERVICES, MY_USER_AGENT, getLogger} from "./common";

const messages = bitmessage.messages;
const logDebug = getLogger("TCP", "debug");
const logInfo = getLogger("TCP", "info");
const logWarn = getLogger("TCP", "warn");

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
      transport.connect(port, host);
    }
    setTimeout(runOutcomingLoop, 100, opts);
  }).catch(function(err) {
    logDebug(
      "Failed to find node to connect (%s), sleeping for 3 seconds",
      err.message);
    setTimeout(runOutcomingLoop, 3000, opts);
  });
}

function listenIncoming(opts) {
  let server = createTransport();
  // TODO(Kagami): Pass new connection info as an object?
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

// Report info about current connections.
function logConnInfo() {
  let allNum = Object.keys(connected).length;
  logDebug("Total %s connection(s) (%s outcoming)", allNum, outcomingNum);
}

// Human-readably size of the message.
function getSize(payload) {
  // Message header length is 24 bytes.
  let len = payload.length + 24;
  if (len >= 1024) {
    return (len / 1024).toFixed(2) + "KiB";
  } else {
    return len + "B";
  }
}

// Setup event handlers for a new incoming/outcoming connection.
function setupTransport({transport, host, port}) {
  let start = new Date().getTime();
  connected[host] = transport;
  logConnInfo();

  transport.on("established", function() {
    let delta = (new Date().getTime() - start) / 1000;
    logInfo("Connection to %s:%s was established in %ss", host, port, delta);

    transport.on("message", function(command, payload) {
      let start = new Date().getTime();
      logDebug(
        "Got new message '%s' (%s) from %s:%s",
        command, getSize(payload), host, port);
      let handler = messageHandlers[command];
      if (!handler) {
        return logInfo(
          "Skip unknown message '%s' from %s:%s",
          command, host, port);
      }

      // Process message.
      // FIXME(Kagami): Timing attack mitigation.
      try {
        handler({transport, host, port, command, payload});
      } catch(err) {
        return logWarn(
          "Failed to process message '%s' (%s) from %s:%s",
          command, err.message, host, port);
      }

      let delta = (new Date().getTime() - start) / 1000;
      logDebug(
        "Message '%s' from %s:%s was successfully processed in %ss",
        command, host, port, delta);
    });
  });

  transport.on("error", function(err) {
    logDebug("Connection error (%s) from %s:%s", err.message, host, port);
  });

  transport.on("close", function() {
    logInfo("Connection to %s:%s was closed", host, port);
    delete connected[host];
    logConnInfo();
  });
}

// NOTE(Kagami): We need hoisting to use this variable in
// `setupTransport` function above.
var messageHandlers = {
  error: function({payload, host, port}) {
    // Just display incoming error message.
    let decoded = messages.error.decodePayload(payload);
    let type = messages.error.type2str(decoded.fatal);
    let text = `Got error message with type ${type} `;
    text += `from ${host}:${port}: ${decoded.errorText}`;
    if (decoded.banTime) {
      text += `; ban time is ${decoded.banTime}s`;
    }
    if (decoded.vector) {
      let hash = decoded.vector.toString("hex");
      text += `; this concerns inventory entry ${hash}`;
    }
    logWarn(text);
  },

  ping: function({transport}) {
    transport.send("pong");
  },

  addr: function({payload}) {
    let decoded = messages.addr.decodePayload(payload);
    logDebug("Got %s network address(es)", decoded.addrs.length);
  },

  inv: function() {
  },

  getdata: function() {
  },

  object: function() {
  },
};
