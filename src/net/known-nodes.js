/**
 * Working with known nodes.
 */

import bitmessage from "bitmessage";
import {TcpTransport} from "bitmessage-transports";
import conf from "../config";
import * as storage from "../storage";
import {DEFAULT_STREAM, getLogger} from "./common";
import {popkey} from "../util";

const logInfo = getLogger("known-nodes", "info");
const logError = getLogger("known-nodes", "error");

const SERVICES_BUF = bitmessage.structs
  .ServicesBitfield()
  .set(bitmessage.structs.ServicesBitfield.NODE_NETWORK)
  .buffer;

// XXX(Kagami): We may want to fix bitmessage bootstrap API so it will
// return object with "host", "port" and "stream" properties instead.
function getSeedObj([host, port, stream]) {
  return {
    host,
    port,
    stream: stream || DEFAULT_STREAM,
    services: SERVICES_BUF,
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
        logInfo("Add %s DNS bootstrap nodes", nodes.length);
        return storage.knownNodes.add(trx, nodes);
      });
    });

  });
}

/** Just an alias for `storage.knownNodes.getRandom`. */
// TODO(Kagami): Error handling.
export function getRandom(stream, excludeHosts) {
  return storage.knownNodes.getRandom(null, stream, excludeHosts);
}

/** Add nodes from the `addr` message. */
export function addAddrs(addrs) {
  if (!addrs.length) { return Promise.resolve(null); }
  return storage.transaction(function(trx) {

    return storage.knownNodes.count(trx).then(function(curNodesCount) {
      let canAdd = 20000 - curNodesCount;
      if (canAdd <= 0) { return; }
      let nodes = addrs.slice(0, canAdd).map(function(addr) {
        // Fix object structure to store in the DB.
        let node = Object.assign({}, addr);
        // TODO(Kagami): Do we want to rename `last_active` field?
        node.last_active = popkey(node, "time");
        node.services = node.services.buffer;
        return node;
      });
      logInfo("Add %s nodes from addr message", nodes.length);
      return storage.knownNodes.add(trx, nodes);
    });

  }).catch(function(err) {
    logError("Error in `knownNodes.addAddrs`: %s", err.message);
    throw err;
  });
}
