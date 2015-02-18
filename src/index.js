/**
 * Application entry point.
 */

import {initSync as initConfigSync, conf} from "./config";
import {init as initLogging} from "./log";
import {init as initStorage} from "./storage";
import {init as initNet} from "./net";

export default function() {
  initConfigSync();
  initLogging()
    .then(initStorage)
    .then(initNet)
    .catch(function(err) {
      console.error(err.message);
      if (conf.get("stack-traces")) {
        console.error("\n%s", err.stack);
      }
      process.exit(1);
    });
}
