const th = require("telehash-promise");

import * as util from "./util";

// You need to load and call this function in order to use
// `nekogrid-node` as a library.
export function initRuntime() {
  require("traceur/bin/traceur-runtime");
}

function initTelehash() {
  // XXX(Kagami): See <https://github.com/telehash/telehash-js/issues/23>.
  delete th.extensions.udp4;
  delete th.extensions.tcp4;
  delete th.extensions.http;
  th.add(require("telehash-ws"));
}

export function start() {
  initRuntime();
  initTelehash();
  util.initConfig();
  util.initLog(th);
}

function generateKeys() {
}
