/**
 * Config routines.
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import convict from "convict";
import parseArgs from "minimist";
import untildify from "untildify";
import pkg from "../package.json";

const APP_NAME = "bitchan";
const APP_VERSION = pkg.version;
// NOTE(Kagami): We don't use XDG here because:
// 1) It doesn't make sense on Windows and we will need to use different
// path. While placing app settings to user profile on Windows may be
// also not a best way, it's still better than having two completely
// different paths.
// 2) We use tilda in config to set up path relative to the user's home
// directory. It would be completely confusing to resolve `~` to
// %APPDATA%.
// 3) XDG require configs to be placed to `~/.config` and data to
// `~/.local/share` which is awful IMO.
const APP_DIR = untildify(path.join("~", "." + APP_NAME));
const DEFAULT_CONFIG_PATH = path.join(APP_DIR, APP_NAME + ".yaml");
const STUB_CONFIG_PATH = path.join(
  __dirname, "..", "etc",
  APP_NAME + ".yaml.example");
const USAGE = `${APP_NAME} v${APP_VERSION}

Options:
  -c, --config   Config path          [default: "${DEFAULT_CONFIG_PATH}"]
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
const DEFAULT_SQLITE_DB_PATH = path.join(APP_DIR, APP_NAME + ".db");
const DEFAULT_LOG_PATH = path.join(APP_DIR, APP_NAME + ".log");
const DEFAULT_LOGGING = {
  file: [{filename: DEFAULT_LOG_PATH, level: "warn", json: false}],
  console: [{level: "info", timestamp: true, colorize: true}],
};

// TODO(Kagami): Validate options.
export const conf = convict({
  "debug": {default: false},
  "tcp-host": {default: "0.0.0.0"},
  "tcp-port": {default: 8444, format: "port"},
  "tcp-seeds": {default: DEFAULT_SEEDS},
  "tcp-dns-seeds": {default: DEFAULT_DNS_SEEDS},
  "tcp-trusted-peer": {default: ["localhost", 8444], format: "*"},
  "ws-host": {default: "0.0.0.0"},
  "ws-port": {default: 18444, format: "port"},
  "storage-backend": {default: "sqlite", format: ["sqlite", "pg"]},
  "sqlite-db-path": {default: DEFAULT_SQLITE_DB_PATH},
  "pg-host": {default: "127.0.0.1"},
  "pg-user": {default: APP_NAME},
  "pg-password": {default: "secret"},
  "pg-database": {default: APP_NAME},
  "logging": {default: DEFAULT_LOGGING, format: "*"},
  "webui": {default: true},
  "webui-host": {default: "localhost"},
  "webui-port": {default: 28444},
});
export default conf;

export function initSync() {
  // Basic CLI boilerplate.
  let argv = parseArgs(process.argv.slice(2), {
    alias: {c: "config", h: "help", v: "version", g: "debug"},
    string: "c",
    boolean: ["h", "v", "g"],
  });
  if (argv.help) {
    console.log(USAGE);
    process.exit();
  }
  if (argv.version) {
    console.log(APP_VERSION);
    process.exit();
  }

  // Load/create config.
  // NOTE(Kagami): default config path is already untildified because
  // user normally shouldn't pass escaped tilda from the shell.
  let configPath = argv.config || DEFAULT_CONFIG_PATH;
  let data;
  try {
    data = fs.readFileSync(configPath, "utf-8");
  } catch(err) {
    if (argv.config || err.code !== "ENOENT") {
      console.error("Failed to load config: %s", err.message);
      process.exit(1);
    }
    try {
      // Assumptions: home directory should exists, application dir is
      // only one level deeper than home dir.
      fs.mkdirSync(APP_DIR);
      data = fs.readFileSync(STUB_CONFIG_PATH, "utf-8");
      fs.writeFileSync(configPath, data);
    } catch(err) {
      console.error("Failed to create default config: %s", err.message);
      process.exit(1);
    }
    console.log("Created default config at", configPath);
  }

  // Parse it.
  let parsed;
  try {
    parsed = yaml.safeLoad(data);
  } catch (err) {
    console.error("Failed to parse config: %s", err.message);
    process.exit(1);
  }
  parsed = parsed || {};

  // Load and validate options.
  conf.load(parsed);
  // TODO(Kagami): Undocumented feature. It accepts long version of
  // config options passed from command line with a higher priority.
  conf.load(argv);
  try {
    // Fix paths with tilda.
    // TODO(Kagami): Move it to validators.
    conf.set("sqlite-db-path", untildify(conf.get("sqlite-db-path")));
    const logging = conf.get("logging") || {};
    Object.keys(logging).forEach(function(tname) {
      if (tname === "file") {
        (logging[tname] || []).forEach(function(tsettings) {
          if (tsettings && tsettings.filename) {
            tsettings.filename = untildify(tsettings.filename);
          }
        });
      }
    });
    conf.set("logging", logging);
    conf.validate();
  } catch(err) {
    console.error("Config validation failed: %s", err.message);
    process.exit(1);
  }
}
