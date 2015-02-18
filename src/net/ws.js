/**
 * WebSocket networking.
 */

import WsTransport from "bitmessage/lib/net/ws";
import conf from "../config";
import {SERVICES, USER_AGENT, log} from "./common";

const logInfo = log("WebSocket", "info");

export function init() {
  let ws = new WsTransport({
    services: SERVICES,
    userAgent: USER_AGENT,
    port: conf.get("ws-port"),
  });
  ws.listen({host: conf.get("ws-host"), port: conf.get("ws-port")});
  logInfo("Listening at %s:%s", conf.get("ws-host"), conf.get("ws-port"));
}
