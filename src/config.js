/**
 * Config routines.
 */

import fs from "fs";
import os from "os";
import path from "path";
import yaml from "js-yaml";
import convict from "convict";
import parseArgs from "minimist";

const APP_NAME = "bitchan";
const APP_VERSION = require("../package.json").version;
const CONFIG_PATH = os.platform() === "win32" ?
  path.join(process.env.APPDATA, APP_NAME, APP_NAME + ".yaml") :
  path.join("/etc", APP_NAME + ".yaml");
const USAGE = `${APP_NAME} v${APP_VERSION}

Options:
  -c, --config   Config path          [default: "${CONFIG_PATH}"]
  -h, --help     Show help
  -v, --version  Show version number
`;

// TODO(Kagami): Validate options.
const conf = convict({
  "tcp-host": {default: "0.0.0.0"},
  "tcp-port": {default: 8444, format: "port"},
  "ws-host": {default: "0.0.0.0"},
  "ws-port": {default: 18444, format: "port"},
  "storage-backend": {default: "sqlite"},
  "sqlite-db-path": {default: "/var/lib/bitchan/bitchan.db"},
  "pg-host": {default: "127.0.0.1"},
  "pg-user": {default: "bitchan"},
  "pg-password": {default: "secret"},
  "pg-database": {default: "bitchan"},
});
export default conf;

export function initSync() {
  // Basic CLI boilerplate.
  let argv = parseArgs(process.argv.slice(2), {
    alias: {c: "config", v: "version", h: "help"},
    boolean: ["v", "h"],
    default: {c: CONFIG_PATH},
  });
  if (argv.help) {
    console.log(USAGE);
    process.exit();
  }
  if (argv.version) {
    console.log(APP_VERSION);
    process.exit();
  }

  // Load and validate real config data.
  let data, parsed;
  try {
    data = fs.readFileSync(argv.config, "utf-8");
  } catch(e) {
    // Skip to exit if we have failed to read the config file.
    return;
  }
  try {
    parsed = yaml.safeLoad(data);
  } catch (e) {
    console.error(`Failed to parse ${argv.config}: ${e.message}`);
    process.exit(1);
  }
  conf.load(parsed);
  try {
    conf.validate();
  } catch(e) {
    console.error(`Failed to load ${argv.config}: ${e.message}`);
    process.exit(1);
  }
}
