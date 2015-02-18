/**
 * Main networking module.
 */

import {init as initTcp} from "./tcp";
import {init as initWs} from "./ws";

export function init() {
  return new Promise(function(resolve) {
    initWs(initTcp());
    resolve();
  });
}
