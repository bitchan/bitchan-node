/**
 * Net common routines.
 */

import bitmessage from "bitmessage";
import pkg from "../../package.json";
import logger from "../log";

export const DEFAULT_STREAM = 1;

export const MY_USER_AGENT = bitmessage.UserAgent.encodeSelfWith({
  name: pkg.name,
  version: pkg.version,
});

export const MY_SERVICES = bitmessage.structs.ServicesBitfield().set([
  bitmessage.structs.ServicesBitfield.NODE_NETWORK,
  bitmessage.structs.ServicesBitfield.NODE_GATEWAY,
]);

// Logging boilerplate since it's easier in use than custom loggers.
export function log(prefix, level) {
  prefix = `[${prefix}] `;
  return function(msg, ...args) {
    msg = prefix + msg;
    return logger.log(level, msg, ...args);
  };
}
