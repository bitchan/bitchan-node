/**
 * Networking.
 */

import bitmessage from "bitmessage";
import TcpTransport from "bitmessage/lib/net/tcp";
import WsTransport from "bitmessage/lib/net/ws";
import pkg from "../package.json";
import conf from "./config";
import logger from "./log";

export function init() {
  return new Promise(function(resolve) {
    initWs(initTcp());
    resolve();
  });
}

const USER_AGENT = bitmessage.UserAgent.encodeSelfWith({
  name: pkg.name,
  version: pkg.version,
});
const SERVICES = bitmessage.structs.ServicesBitfield().set([
  bitmessage.structs.ServicesBitfield.NODE_NETWORK,
  bitmessage.structs.ServicesBitfield.NODE_GATEWAY,
]);

function createTcp() {
  return new TcpTransport({
    seeds: conf.get("tcp-seeds"),
    dnsSeeds: conf.get("tcp-dns-seeds"),
    services: SERVICES,
    userAgent: USER_AGENT,
    port: conf.get("tcp-port"),
  });
}

function initTcp() {
  let trustedPeer = conf.get("tcp-trusted-peer");
  if (trustedPeer) {
    return initTcpTrustedPeer(trustedPeer);
  } else {
    return initTcpCommon();
  }
}

function initTcpCommon() {
  let transports = [];

  let server = createTcp();
  transports.push(server);
  server.on("connection", function(client, host, port) {
    logger.info("Got new connection from %s:%s", host, port);
  });
  server.listen(conf.get("tcp-port"), conf.get("tcp-host"));
  // TODO(Kagami): Should we use separate loggers with custom formatter
  // for TCP and WS events?
  logger.info(
    "[TCP] Listening at %s:%s",
    conf.get("tcp-host"),
    conf.get("tcp-port")
  );

  return transports;
}

function initTcpTrustedPeer(trustedPeer) {
  let trustedPeerHost = trustedPeer[0];
  let trustedPeerPort = trustedPeer[1];
  let client = createTcp();
  client.on("open", function() {
    logger.info(
      "[TCP] Connected to trusted peer at %s:%s",
      trustedPeerHost,
      trustedPeerPort
    );
  });
  // client.connect(trustedPeerPort, trustedPeerHost);
  return [client];
}

function initWs() {
  let ws = new WsTransport({
    services: SERVICES,
    userAgent: USER_AGENT,
    port: conf.get("ws-port"),
  });
  ws.listen({host: conf.get("ws-host"), port: conf.get("ws-port")});
  logger.info(
    "[WebSocket] Listening at %s:%s",
    conf.get("ws-host"),
    conf.get("ws-port")
  );
}
