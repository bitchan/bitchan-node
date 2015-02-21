/**
 * WebSocket networking.
 */

import WsTransport from "bitmessage/lib/net/ws";
import conf from "../config";
import {MY_SERVICES, MY_USER_AGENT, getLogger} from "./common";

const logInfo = getLogger("WebSocket", "info");

export function init() {
  return new Promise(function(resolve) {
    let ws = new WsTransport({
      services: MY_SERVICES,
      userAgent: MY_USER_AGENT,
      port: conf.get("ws-port"),
    });
    ws.listen({host: conf.get("ws-host"), port: conf.get("ws-port")});
    logInfo("Listening at %s:%s", conf.get("ws-host"), conf.get("ws-port"));
    resolve();
  });
}
