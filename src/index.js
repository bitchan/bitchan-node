import "traceur/bin/traceur-runtime";
import th from "telehash-promise";
import tpws from "telehash-ws";
import * as util from "./util";

function initTelehash() {
  // XXX(Kagami): See <https://github.com/telehash/telehash-js/issues/23>.
  delete th.extensions.udp4;
  delete th.extensions.tcp4;
  delete th.extensions.http;
  th.add(tpws);
}

export function start() {
  util.initConfig();
  util.initLog(th);
  initTelehash();
}

// function generateKeys() {
// }
