/**
 * TCP networking.
 * Basically it almost fully copies PyBitmessage behavior to be more
 * compatible with the rest of network.
 */

import moment from "moment";
import bitmessage from "bitmessage";
import {TcpTransport} from "bitmessage-transports";
import conf from "../config";
import {getLogger} from "../log";
import {DEFAULT_STREAM, MY_USER_AGENT} from "./common";
import * as knownNodes from "./known-nodes";
import * as inventory from "../inventory";

const messages = bitmessage.messages;
const ServicesBitfield = bitmessage.structs.ServicesBitfield;
const logSilly = getLogger("TCP", "silly");
const logDebug = getLogger("TCP", "debug");
const logInfo = getLogger("TCP", "info");
const logWarn = getLogger("TCP", "warn");
const logError = getLogger("TCP", "error");

export function init() {
  // NOTE(Kagami): Using only stream 1 as for now.
  return getTrustedPeer(conf.get("tcp-trusted-peer"), DEFAULT_STREAM)
  .then(function(trustedPeer) {
    runOutcomingLoop({
      trustedPeer,
      limit: getOutcomingLimit(trustedPeer),
      stream: DEFAULT_STREAM,
      port: conf.get("tcp-port"),
    });
    if (trustedPeer) {
      logInfo("Trusted peer mode, incoming connections are forbidden");
    } else {
      listenIncoming({
        stream: DEFAULT_STREAM,
        host: conf.get("tcp-host"),
        port: conf.get("tcp-port"),
      });
    }
  });
}

function getTrustedPeer(cfgTrustedPeer, stream) {
  return new Promise(function(resolve) {
    let peerp = null;
    if (cfgTrustedPeer) {
      let trustedPeer = {
        host: cfgTrustedPeer[0],
        port: cfgTrustedPeer[1],
        stream,
        services: knownNodes.SERVICES,
        time: new Date(),
      };
      peerp = knownNodes.addAddrs([trustedPeer], stream).then(function() {
        return trustedPeer;
      });
    }
    resolve(peerp);
  });
}

// Dictionary of connected/half-open transports accessed by IP.
const connected = new Map();
// Number of outcoming connections.
let outcomingNum = 0;

// Return limit of outcoming connections.
function getOutcomingLimit(trustedPeer) {
  return trustedPeer ? 1 : 8;
}

// Return a promise that contains random known node.
function getNode({stream, trustedPeer}) {
  // TODO(Kagami): Attempted connections list.
  if (trustedPeer) {
    return Promise.resolve(trustedPeer);
  } else {
    let exclude = [...connected.keys()];
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

  getNode(opts).then(function({host, port}) {
    // Check whether we are already connected to the returned node's
    // host once more time (`getNode` also filters connected nodes) to
    // protect ourself against race condition because of async SQL
    // query.
    if (!connected.has(host)) {
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
  const server = createTransport({stream: opts.stream, port: opts.port});
  // TODO(Kagami): Pass new connection info as an object?
  server.on("connection", function(transport, host, port) {
    logInfo("Got new connection from %s:%s", host, port);
    if (connected.has(host)) {
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

// Human-readably size of the message.
function getSize(payload) {
  // Message header length is 24 bytes.
  const len = payload.length + 24;
  if (len >= 1024) {
    return (len / 1024).toFixed(2) + "KiB";
  } else {
    return len + "B";
  }
}

// Setup event handlers for a new incoming/outcoming connection.
function initTransport({transport, host, port, stream}) {
  let start = moment();
  connected.set(host, transport);
  logDebug(
    "Total %s connection(s) (%s outcoming)",
    connected.size, outcomingNum);

  // Don't update this particular transport too often.
  let lastUpdate = moment(0);
  function bumpActivity() {
    if (moment().diff(lastUpdate, "minutes") >= 5) {
      knownNodes.bumpActivity({host, port, stream});
      lastUpdate = moment();
    }
  }

  transport.on("established", function(version) {
    let delta = moment().diff(start, "seconds", true);
    logInfo(
      "Connection to %s:%s (%s) was established in %ss",
      host, port, version.userAgent, delta);
    broadcastAddrs([{
      host,
      port,
      stream,
      services: version.services,
    }]);
    sendBigAddr({transport, stream});
    sendBigInv({transport, stream});

    transport.on("message", function(command, payload) {
      start = moment();
      bumpActivity();
      logSilly(
        "Got new message '%s' (%s) from %s",
        command, getSize(payload), transport);
      const handler = messageHandlers[command];
      if (!handler) {
        return logWarn("Skip unknown message '%s' from %s", command, transport);
      }

      // Process message.
      // FIXME(Kagami): Timing attack mitigation.
      try {
        handler({transport, host, port, stream, command, payload});
      } catch(err) {
        return logWarn(
          "Failed to process message '%s' from %s (%s)",
          command, transport, err.message);
      }

      delta = moment().diff(start, "seconds", true);
      logSilly(
        "Message '%s' from %s was successfully processed in %ss",
        command, transport, delta);
    });
  });

  transport.on("warning", function(err) {
    logWarn("Connection warning from %s: %s", transport, err.message);
  });

  transport.on("error", function(err) {
    logWarn("Connection error from %s: %s", transport, err.message);
  });

  transport.on("close", function() {
    logInfo("Connection to %s:%s was closed", host, port);
    connected.delete(host);
    logDebug(
      "Total %s connection(s) (%s outcoming)",
      connected.size, outcomingNum);
  });
}

// Broadcast given message to all connected transports.
// FIXME(Kagami): Timing attack mitigation.
function broadcast(...args) {
  // XXX(Kagami): Better to use `for...of` but it seems to generate
  // inefficient code in babel currently.
  [...connected.values()].forEach(transport => transport.send(...args));
}

// NOTE(Kagami): We need hoisting to use this variable in
// `initTransport` function above.
var messageHandlers = {
  error: function({transport, payload}) {
    // TODO(Kagami): Currently we just display incoming error message
    // (as PyBitmessage). We may want to take into account some of this
    // data in the future.
    const error = messages.error.decodePayload(payload);
    const type = messages.error.type2str(error.type);
    let text = `Got error message with type ${type} from ${transport}: `;
    text += error.errorText;
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
    const addrs = messages.addr.decodePayload(payload).addrs;
    logDebug("Got %s filtered network address(es)", addrs.length);
    knownNodes.addAddrs(addrs, stream).then(broadcastAddrs);
  },

  inv: function({transport, payload}) {
    let vectors = messages.inv.decodePayload(payload).vectors;
    if (!vectors.length) { return; }
    logDebug("Got %s inventory vector(s)", vectors.length);
    // FIXME(Kagami): We should wait some time and request random object
    // from random peer. This way if we get multiple inv messages from
    // multiple peers which list mostly the same objects, we will make
    // getdata requests for different random objects from the various
    // peers.
    // FIXME(Kagami): Flooding attack mitigation.
    inventory.getNewVectors(vectors).then(function(vectors) {
      if (!vectors.length) { return; }
      logInfo(
        "Request %s new inventory vector(s) from %s",
        vectors.length, transport);
      // NOTE(Kagami): Input vectors list length should be less or equal
      // than 50,000 so it's safe to encode them in `getdata` message.
      transport.send(messages.getdata.encode(vectors));
    });
  },

  getdata: function() {
  },

  object: function() {
  },
};

// Send a huge addr message to our peer. This is only used when we fully
// establish a connection with a peer.
function sendBigAddr({transport, stream}) {
  knownNodes.getAddrs(stream).then(function(addrs) {
    if (!addrs.length) { return; }
    logDebug(
      "Send %s initial network address(es) to %s",
      addrs.length, transport);
    const addr = messages.addr.encode(addrs);
    transport.send(addr);
  });
}

// Broadcast new addresses to all connected peers.
// TODO(Kagami): We may want to skip the node-originator of this addr
// message.
function broadcastAddrs(addrs) {
  if (!addrs.length) { return; }
  logInfo("Broadcast %s network address(es)", addrs.length);
  const addr = messages.addr.encode(addrs);
  broadcast(addr);
}

// Send a big inv message when the connection with a node is first fully
// established.
function sendBigInv({transport, stream}) {
  inventory.getVectors(stream).then(function(vectors) {
    if (!vectors.length) { return; }
    logDebug("Send %s initial vector(s) to %s", vectors.length, transport);
    do {
      transport.send(messages.inv.encode(vectors.slice(0, 50000)));
      vectors = vectors.slice(50000);
    } while (vectors.length);
  });
}
