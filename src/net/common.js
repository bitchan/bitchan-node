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

// Simple logger factory since it's easier in use than custom loggers.
export function getLogger(prefix, level) {
  prefix = `[${prefix}] `;
  return function(msg, ...args) {
    msg = prefix + msg;
    // Force empty meta because winston tries to use last argument as a
    // metadata which might be confusing.
    return logger.log(level, msg, ...args, {});
  };
}
