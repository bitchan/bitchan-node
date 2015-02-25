/**
 * Working with known nodes.
 */

import bitmessage from "bitmessage";
import {TcpTransport} from "bitmessage-transports";
import conf from "../config";
import * as storage from "../storage";
import {DEFAULT_STREAM, getLogger} from "./common";

const logInfo = getLogger("known-nodes", "info");

const SERVICES_BUF = bitmessage.structs
  .ServicesBitfield()
  .set(bitmessage.structs.ServicesBitfield.NODE_NETWORK)
  .buffer;

// XXX(Kagami): We may want to fix bitmessage bootstrap API so it will
// return object with "host", "port" and "stream" properties instead.
function getSeedObj(node) {
  return {
    host: node[0],
    port: node[1],
    stream: node[2] || DEFAULT_STREAM,
    services: SERVICES_BUF,
    // Zero timestamp to mark seed node as not-advertiseable.
    last_active: 0,
  };
}

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
