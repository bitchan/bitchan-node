/**
 * TCP networking.
 * Basically it almost fully copies PyBitmessage behavior to be more
 * compatible with the rest of network.
 */

import bitmessage from "bitmessage";
import {TcpTransport} from "bitmessage-transports";
import conf from "../config";
import {DEFAULT_STREAM, MY_USER_AGENT, getLogger} from "./common";
import * as knownNodes from "./known-nodes";

const messages = bitmessage.messages;
const ServicesBitfield = bitmessage.structs.ServicesBitfield;
const logDebug = getLogger("TCP", "debug");
const logInfo = getLogger("TCP", "info");
const logWarn = getLogger("TCP", "warn");
const logError = getLogger("TCP", "error");

export function init() {
  return new Promise(function(resolve) {
    if (conf.get("tcp-trusted-peer")) {
      logInfo("Trusted peer mode, incoming connections are forbidden");
    }
    // NOTE(Kagami): Use stream 1 only for a moment.
    runOutcomingLoop({
      limit: getOutcomingLimit(),
      stream: DEFAULT_STREAM,
      port: conf.get("tcp-port"),
    });
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
    return knownNodes.getRandom(stream, exclude);
  }
}

function createTransport({stream, port}) {
  return new TcpTransport({
    services: ServicesBitfield().set([
      ServicesBitfield.NODE_NETWORK,
      ServicesBitfield.NODE_GATEWAY,
    ]),
    userAgent: MY_USER_AGENT,
    streams: [stream],
    port: port,
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
      let transport = createTransport({stream: opts.stream, port: opts.port});
      outcomingNum++;
      transport.on("close", function() {
        outcomingNum--;
      });
      initTransport({transport, host, port, stream: opts.stream});
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
  let server = createTransport({stream: opts.stream, port: opts.port});
  // TODO(Kagami): Pass new connection info as an object?
  server.on("connection", function(transport, host, port) {
    logInfo("Got new connection from %s:%s", host, port);
    if (isConnected(host)) {
      logInfo("We are already connected to %s, closing connection", host);
      transport.close();
      return;
    }
    initTransport({transport, host, port, stream: opts.stream});
  });
  server.on("error", function(err) {
    logError("Server error: %s", err.message);
  });
  server.on("close", function() {
    logError("Server was unexpectedly closed. Exiting.");
    process.exit(1);
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
function initTransport({transport, host, port, stream}) {
  let start = new Date().getTime();
  connected[host] = transport;
  logConnInfo();

  transport.on("established", function(version) {
    let delta = (new Date().getTime() - start) / 1000;
    logInfo(
      "Connection to %s:%s (%s) was established in %ss",
      host, port, version.userAgent, delta);
    sendBigAddr({transport, host, port, stream});

    transport.on("message", function(command, payload) {
      let start = new Date().getTime();
      logDebug(
        "Got new message '%s' (%s) from %s:%s",
        command, getSize(payload), host, port);
      let handler = messageHandlers[command];
      if (!handler) {
        return logWarn(
          "Skip unknown message '%s' from %s:%s",
          command, host, port);
      }

      // Process message.
      // FIXME(Kagami): Timing attack mitigation.
      try {
        handler({transport, host, port, stream, command, payload});
      } catch(err) {
        return logWarn(
          "Failed to process message '%s' from %s:%s: %s",
          command, host, port, err.message);
      }

      let delta = (new Date().getTime() - start) / 1000;
      logDebug(
        "Message '%s' from %s:%s was successfully processed in %ss",
        command, host, port, delta);
    });
  });

  transport.on("warning", function(err) {
    logWarn("Connection warning from %s:%s: %s", host, port, err.message);
  });

  transport.on("error", function(err) {
    logWarn("Connection error from %s:%s: %s", host, port, err.message);
  });

  transport.on("close", function() {
    logInfo("Connection to %s:%s was closed", host, port);
    delete connected[host];
    logConnInfo();
  });
}

// NOTE(Kagami): We need hoisting to use this variable in
// `initTransport` function above.
var messageHandlers = {
  error: function({payload, host, port}) {
    // TODO(Kagami): Currently we just display incoming error message
    // (as PyBitmessage). We may want to take into account some of this
    // data in the future.
    let error = messages.error.decodePayload(payload);
    let type = messages.error.type2str(error.type);
    let text = `Got error message with type ${type} `;
    text += `from ${host}:${port}: ${error.errorText}`;
    if (error.banTime) {
      text += `; ban time is ${error.banTime}s`;
    }
    if (error.vector) {
      text += `; this concerns inventory entry ${error.vector.toString("hex")}`;
    }
    logWarn(text);
  },

  ping: function({transport}) {
    // Protocol doesn't require answer to the "ping" messages but we
    // copy PyBitmessage behavior anyway just in case.
    transport.send("pong");
  },

  pong: function() {
    // PyBitmessage sends a "pong" message if it hasn't sent anything
    // else in the last five minutes. We receive this message but do
    // nothing with it.
  },

  addr: function({payload, stream}) {
    let addrs = messages.addr.decodePayload(payload).addrs;
    logDebug("Got %s network address(es)", addrs.length);
    let acceptedStreams = [stream, stream*2, stream*2+1];
    let now = new Date().getTime();
    addrs = addrs.filter(function(addr) {
      if (acceptedStreams.indexOf(addr.stream) === -1) {
        return false;
      }
      let delta = (addr.time.getTime() - now) / 1000;
      if (delta > 10800 || delta < -10800) {
        return false;
      }
      return true;
    });
    knownNodes.addAddrs(addrs);
  },

  inv: function() {
  },

  getdata: function() {
  },

  object: function() {
  },
};

// Send a huge addr message to our peer. This is only used when we fully
// establish a connection with a peer.
function sendBigAddr({transport, host, port, stream}) {
  knownNodes.getAddrs(stream).then(function(addrs) {
    logDebug(
      "Sending %s network address(es) to %s:%s",
      addrs.length, host, port);
    let addr = messages.addr.encode(addrs);
    transport.send(addr);
  });
}
