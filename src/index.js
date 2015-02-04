import {initConfig} from "./util";
import {initDb} from "./db";

export function start() {
  initConfig();
  initDb();
}
