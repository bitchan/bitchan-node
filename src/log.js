/**
 * Logging module.
 * Provides log routines using winston.
 */

import winston from "winston";
import conf from "./config";

const logger = new winston.Logger({transports: []});
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
