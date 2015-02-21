/**
 * Config routines.
 */

import fs from "fs";
import os from "os";
import path from "path";
import yaml from "js-yaml";
import convict from "convict";
import parseArgs from "minimist";
import pkg from "../package.json";

const APP_NAME = "bitchan";
const APP_VERSION = pkg.version;
const CONFIG_PATH = os.platform() === "win32" ?
  path.join(process.env.APPDATA, APP_NAME, APP_NAME + ".yaml") :
  path.join("/etc", APP_NAME + ".yaml");
const USAGE = `${APP_NAME} v${APP_VERSION}

Options:
  -c, --config   Config path          [default: "${CONFIG_PATH}"]
  -h, --help     Show help
  -v, --version  Show version number
  -g, --debug    Enable extra debug
`;
// NOTE(Kagami): Imply stream number 1 by default to simplify things. We
// may introduce third argument indicating stream number in future.
const DEFAULT_SEEDS = [
  ["23.239.9.147", 8444],
  ["98.218.125.214", 8444],
  ["192.121.170.162", 8444],
  ["108.61.72.12", 28444],
  ["158.222.211.81", 8080],
  ["79.163.240.110", 8446],
  ["178.62.154.250", 8444],
  ["178.62.155.6", 8444],
  ["178.62.155.8", 8444],
  ["68.42.42.120", 8444],
];
const DEFAULT_DNS_SEEDS = [
  ["bootstrap8444.bitmessage.org", 8444],
  ["bootstrap8080.bitmessage.org", 8080],
];
const LOG_PATH = "/var/log/bitchan/bitchan.log";
const DEFAULT_LOGGING = {
  file: [{filename: LOG_PATH, level: "warn", json: false}],
  console: [{level: "info", timestamp: true, colorize: true}],
};

// TODO(Kagami): Validate options.
// TODO(Kagami): Current default values are most suitable for
// production-like usages (requires separate user, catalogs structure,
// etc.). Should we allow to run it from normal user without
// preconfiguration steps? See <https://github.com/rlidwka/sinopia> for
// an example.
export const conf = convict({
  "debug": {default: false},
  "tcp-host": {default: "0.0.0.0"},
  "tcp-port": {default: 8444, format: "port"},
  "tcp-seeds": {default: DEFAULT_SEEDS},
  "tcp-dns-seeds": {default: DEFAULT_DNS_SEEDS},
  "tcp-trusted-peer": {default: null, format: "*"},
  "ws-host": {default: "0.0.0.0"},
  "ws-port": {default: 18444, format: "port"},
  "storage-backend": {default: "sqlite", format: ["sqlite", "pg"]},
  "sqlite-db-path": {default: "/var/lib/bitchan/bitchan.db"},
  "pg-host": {default: "127.0.0.1"},
  "pg-user": {default: "bitchan"},
  "pg-password": {default: "secret"},
  "pg-database": {default: "bitchan"},
  "logging": {default: DEFAULT_LOGGING},
});
export default conf;

export function initSync() {
  // Basic CLI boilerplate.
  let argv = parseArgs(process.argv.slice(2), {
    alias: {c: "config", v: "version", h: "help", g: "debug"},
    boolean: ["v", "h", "t"],
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

  // Load CLI arguments.
  conf.load(argv);

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
    console.error("Failed to parse %s: %s", argv.config, e.message);
    process.exit(1);
  }
  conf.load(parsed);
  try {
    conf.validate();
  } catch(e) {
    console.error("Failed to load %s: %s", argv.config, e.message);
    process.exit(1);
  }
}
