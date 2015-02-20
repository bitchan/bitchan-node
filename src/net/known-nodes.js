/**
 * Working with known nodes.
 */

import bitmessage from "bitmessage";
import TcpTransport from "bitmessage/lib/net/tcp";
import conf from "../config";
import * as storage from "../storage";
import {DEFAULT_STREAM, log} from "./common";

const logDebug = log("known-nodes", "debug");

const SERVICES_BUF = bitmessage.structs
  .ServicesBitfield()
  .set(bitmessage.structs.ServicesBitfield.NODE_NETWORK)
  .buffer;

// XXX(Kagami): We may want to fix bitmessage bootstrap API so it will
// return object with "host", "port" and "stream" properties instead.
function getnodeobj(node) {
  return {
    host: node[0],
    port: node[1],
    stream: node[2] || DEFAULT_STREAM,
    services: SERVICES_BUF,
    // zero timestamp marks this node as not-advertiseable.
    last_active: 0,
  };
}

export function init() {
  return storage.transaction(function(trx) {

    return storage.knownNodes.isEmpty(trx).then(function(empty) {
      if (!empty) { return; }
      var nodes = conf.get("tcp-seeds").map(getnodeobj);
      logDebug(
        "Store is empty, add %s hardcoded bootstrap nodes",
        nodes.length
      );
      return storage.knownNodes.add(trx, nodes);
    }).then(function() {
      // Copy PyBitmessage behavior here, don't lookup seeds via DNS for
      // trusted peer mode.
      if (conf.get("tcp-trusted-peer")) { return; }
      var transport = new TcpTransport({dnsSeeds: conf.get("tcp-dns-seeds")});
      return transport.bootstrapDns().then(function(nodes) {
        nodes = nodes.map(getnodeobj);
        logDebug("Add %s DNS bootstrap nodes", nodes.length);
        return storage.knownNodes.add(trx, nodes);
      });
    });

  });
}
