/**
 * Logging module.
 * Provides log routines using winston.
 */

import winston from "winston";
import conf from "./config";

export const logger = new winston.Logger({transports: []});
export default logger;

export function init() {
  return new Promise(function(resolve) {
    let logging = conf.get("logging");
    let nameCounter = 0;

    Object.keys(logging).forEach(function(tname) {
      let transport;
      switch (tname.toLowerCase()) {
        case "console":
          transport = winston.transports.Console;
          break;
        case "file":
          transport = winston.transports.File;
          break;
        default:
          // Silently skip unknown transports.
          return;
      }
      (logging[tname] || []).forEach(function(tsettings) {
        tsettings = Object.assign({name: nameCounter.toString()}, tsettings);
        logger.add(transport, tsettings);
        nameCounter++;
      });
    });

    resolve();
  });
}

/**
 * Logger factory, simplier than custom loggers.
 */
export function getLogger(prefix, level) {
  prefix = `[${prefix}] `;
  return function(msg, ...args) {
    msg = prefix + msg;
    // NOTE(Kagami): Force empty meta because winston tries to use last
    // argument as a metadata which might be confusing.
    return logger.log(level, msg, ...args, {});
  };
}
