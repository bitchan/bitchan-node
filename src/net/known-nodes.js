/**
 * Working with known nodes.
 */

import moment from "moment";
import bitmessage from "bitmessage";
import {TcpTransport} from "bitmessage-transports";
import conf from "../config";
import * as storage from "../storage";
import {DEFAULT_STREAM, getLogger} from "./common";
import {assert, popkey} from "../util";

const logInfo = getLogger("known-nodes", "info");
const logError = getLogger("known-nodes", "error");
const ServicesBitfield = bitmessage.structs.ServicesBitfield;
export const SERVICES = ServicesBitfield().set(ServicesBitfield.NODE_NETWORK);

// XXX(Kagami): We may want to fix bitmessage bootstrap API so it will
// return object with "host", "port" and "stream" properties instead.
function getSeedObj([host, port, stream]) {
  return {
    host,
    port,
    stream: stream || DEFAULT_STREAM,
    services: SERVICES.buffer,
    // Zero timestamp to mark seed node as not-advertiseable.
    last_active: 0,
  };
}

/** Initialize known nodes entries. */
export function init() {
  return storage.transaction(function(trx) {

    return storage.knownNodes.isEmpty(trx).then(function(empty) {
      if (!empty) { return; }
      var nodes = conf.get("tcp-seeds").map(getSeedObj);
      logInfo("Store is empty, add %s hardcoded bootstrap nodes", nodes.length);
      return storage.knownNodes.add(trx, nodes);
    }).then(function() {
      // Copy PyBitmessage behavior here, don't lookup seeds via DNS for
      // trusted peer mode.
      if (conf.get("tcp-trusted-peer")) { return; }
      var transport = new TcpTransport({dnsSeeds: conf.get("tcp-dns-seeds")});
      return transport.bootstrapDns().then(function(nodes) {
        nodes = nodes.map(getSeedObj);
        logInfo("Add %s DNS bootstrap node(s)", nodes.length);
        return storage.knownNodes.add(trx, nodes);
      });
    });

  });
}

/** Just an alias for `storage.knownNodes.getRandom`. */
export function getRandom(stream, excludeHosts) {
  return storage.knownNodes.getRandom(null, stream, excludeHosts);
}

// NOTE(Kagami): This logic is here and not in `tcp` module because
// `getAddrs` does very similar filterings.
function filterAddrs(addrs, stream) {
  let acceptedStreams = [stream, stream*2, stream*2+1];
  let now = moment();
  return addrs.filter(function(addr) {
    if (acceptedStreams.indexOf(addr.stream) === -1) {
      return false;
    }
    let delta = now.diff(addr.time, "hours", true);
    if (delta > 3 || delta < -3) {
      return false;
    }
    return true;
  });
}

function getAddrMapKey(node) {
  return `${node.host}|${node.port}|${node.stream}`;
}

/**
 * Create/update known nodes from the `addr` message and return addrs
 * which we haven't known before.
 */
export function addAddrs(addrs, stream) {
  // Filter out inappropriate addrs at first.
  addrs = filterAddrs(addrs, stream);
  if (!addrs.length) {
    return Promise.resolve([]);
  }
  return storage.transaction(function(trx) {

    return storage.knownNodes.getDups(trx, addrs).then(function(dupNodes) {
      // NOTE(Kagami): We can't use ECMA6 Map here because arrays got
      // compared by reference.
      let dupMap = Object.create(null);
      dupNodes.forEach(function(n) {
        dupMap[getAddrMapKey(n)] = n.last_active;
      });
      let addrsToInsert = [];  // Completely new addresses
      let addrsToUpdate = [];  // Addresses with updated last_active
      addrs.forEach(function(addr) {
        let dupTime = dupMap[getAddrMapKey(addr)];
        if (typeof dupTime === "undefined") {
          addrsToInsert.push(addr);
        } else if (moment(addr.time).isAfter(dupTime)) {
          addrsToUpdate.push(addr);
        }
      });
      if (!addrsToInsert.length && !addrsToUpdate.length) {
        // Nothing to do, exiting.
        return [];
      }
      return storage.knownNodes.count(trx).then(function(curNodesCount) {
        // Save reference to array because we are going to change it
        // length (not in-place).
        let addrsToReturn = addrsToInsert;
        let canInsert = 20000 - curNodesCount;
        if (canInsert <= 0) {
          if (!addrsToUpdate.length) {
            // Nothing to do, exiting.
            return [];
          }
          addrsToInsert = [];
        } else {
          addrsToInsert = addrsToInsert.slice(0, canInsert);
        }
        // Fix objects structure to save in the store.
        let nodes = addrsToInsert.concat(addrsToUpdate).map(function(addr) {
          let node = Object.assign({}, addr);
          node.services = node.services.buffer;
          // TODO(Kagami): Do we need to rename `last_active` field?
          node.last_active = popkey(node, "time");
          return node;
        });
        logInfo(
          "Add/update %s known node(s) (%s new)",
          nodes.length, addrsToInsert.length);
        return storage.knownNodes.add(trx, nodes).then(function() {
          return addrsToReturn;
        });
      });
    });

  }).catch(function(err) {
    logError("Error in `knownNodes.addAddrs`: %s", err.message);
    throw err;
  });
}

/** Find nodes for the `addr` message. */
export function getAddrs(stream) {
  let after = moment().subtract(3, "hours").toDate();
  let nodes = [];
  // We are going to share maximum number of 1000 addrs with our peer.
  // 500 from this stream, 250 from the left child stream, and 250 from
  // the right child stream.
  return storage.transaction(function(trx) {

    return storage.knownNodes.get(trx, stream, after, 500)
    .then(function(ns) {
      nodes = nodes.concat(ns);
      return storage.knownNodes.get(trx, stream*2, after, 250);
    }).then(function(ns) {
      nodes = nodes.concat(ns);
      return storage.knownNodes.get(trx, stream*2+1, after, 250);
    }).then(function(ns) {
      nodes = nodes.concat(ns);
      return nodes.map(function(node) {
        // TODO(Kagami): For some reason knex returns millisecond
        // timestamp number instead of Date object. File a bug to knex's
        // bugtracker.
        node.time = new Date(node.last_active);
        return node;
      });
    });

  }).catch(function(err) {
    logError("Error in `knownNodes.getAddrs`: %s", err.message);
    throw err;
  });
}

export function bumpActivity(node) {
  return storage.knownNodes
    .update(null, node, {last_active: new Date()})
    .then(function(updCount) {
      assert(updCount, `Node ${node.host}:${node.port} wasn't updated`);
    }).catch(function(err) {
      logError("Error in `knownNodes.bumpActivity`: %s", err.message);
      throw err;
    });
}
