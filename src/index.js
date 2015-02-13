/**
 * Application entry point.
 */

import {initSync as initConfigSync} from "./config";
import {init as initStorage} from "./storage";
import {init as initNet} from "./net";

export default function() {
  initConfigSync();
  initStorage().then(initNet).catch(function(err) {
    console.error(err.message);
    process.exit(1);
  });
}
