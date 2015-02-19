/**
 * Main networking module. Does nothing except initializaing submodules.
 */

import {init as initKnownNodes} from "./known-nodes";
import {init as initTcp} from "./tcp";
import {init as initWs} from "./ws";

export function init() {
  return initKnownNodes().then(initTcp).then(initWs);
}
