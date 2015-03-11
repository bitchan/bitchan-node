/**
 * Application entry point.
 */

// NOTE(Kagami): Some conventions used across this repo:
// * Module `init` functions are always return promises
// * Module `initSync` functions don't return anything and may have
//   side-effects (e.g. exit node process)
// * All storage management routines accept transaction reference as the
//   first argument or null and return promises

import {initSync as initConfigSync, conf} from "./config";
import {init as initLogging} from "./log";
import {init as initStorage} from "./storage";
import {init as initWebui} from "./webui";
import {init as initNet} from "./net";

export default function() {
  initConfigSync();
  initLogging()
    .then(initStorage)
    .then(initWebui)
    .then(initNet)
    .catch(function(err) {
      console.error(err.message);
      if (conf.get("debug")) {
        console.error("\n%s", err.stack);
      }
      process.exit(1);
    });
}
