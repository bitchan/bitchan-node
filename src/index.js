/**
 * Application entry point.
 */

import {init as initConfig} from "./config";
import {init as initDb} from "./db";

export default function() {
  initConfig();
  initDb();
}
