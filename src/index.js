import "6to5/polyfill";
import {initConfig} from "./util";
import {initDb} from "./db";

export function start() {
  initConfig();
  initDb();
}
