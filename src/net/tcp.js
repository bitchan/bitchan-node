/**
 * TCP networking.
 */

import TcpTransport from "bitmessage/lib/net/tcp";
import conf from "../config";
import {MY_SERVICES, MY_USER_AGENT, log} from "./common";

const logInfo = log("TCP", "info");

export function init() {
  return new Promise(function(resolve) {
    let trustedPeer = conf.get("tcp-trusted-peer");
    if (trustedPeer) {
      resolve(initTrustedPeer(trustedPeer));
    } else {
      resolve(initCommon());
    }
  });
}

function createTransport() {
  return new TcpTransport({
    seeds: conf.get("tcp-seeds"),
    dnsSeeds: conf.get("tcp-dns-seeds"),
    services: MY_SERVICES,
    userAgent: MY_USER_AGENT,
    port: conf.get("tcp-port"),
  });
}

function initCommon() {
  let transports = [];
  let server = createTransport();
  transports.push(server);
  server.on("connection", function(client, host, port) {
    logInfo("Got new connection from %s:%s", host, port);
  });
  server.listen(conf.get("tcp-port"), conf.get("tcp-host"));
  logInfo("Listening at %s:%s", conf.get("tcp-host"), conf.get("tcp-port"));
  return transports;
}

function initTrustedPeer(trustedPeer) {
  let trustedPeerHost = trustedPeer[0];
  let trustedPeerPort = trustedPeer[1];
  let client = createTransport();
  client.on("open", function() {
    logInfo(
      "Connected to trusted peer at %s:%s",
      trustedPeerHost,
      trustedPeerPort
    );
  });
  // client.connect(trustedPeerPort, trustedPeerHost);
  return [client];
}
