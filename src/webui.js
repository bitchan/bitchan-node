/**
 * Host bitchan web interface.
 */

import path from "path";
import http from "http";
import express from "express";
import conf from "./config";
import {getLogger} from "./log";

const WEBUI_STATIC_PATH = path.join(
  __dirname, "..", "node_modules", "bitchan-web", "dist");
const logInfo = getLogger("WebUI", "info");

export function init() {
  return new Promise(function(resolve, reject) {
    if (!conf.get("webui")) {
      return resolve();
    }
    const host = conf.get("webui-host");
    const port = conf.get("webui-port");
    const app = express();
    app.use(express.static(WEBUI_STATIC_PATH));
    const server = http.createServer(app);
    server.on("error", reject);
    server.listen(port, host, resolve);
    logInfo("Host web interface at %s:%s", host, port);
  });
}
