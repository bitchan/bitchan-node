/**
 * WebSocket networking.
 */

import {WsTransport} from "bitmessage-transports";
import conf from "../config";
import {getLogger} from "../log";
import {DEFAULT_STREAM, MY_USER_AGENT} from "./common";

const logInfo = getLogger("WebSocket", "info");

export function init() {
  return new Promise(function(resolve) {
    const ws = new WsTransport({
      userAgent: MY_USER_AGENT,
      streamNumbers: [DEFAULT_STREAM],
      port: conf.get("ws-port"),
    });
    ws.listen({host: conf.get("ws-host"), port: conf.get("ws-port")});
    logInfo("Listen at %s:%s", conf.get("ws-host"), conf.get("ws-port"));
    resolve();
  });
}
