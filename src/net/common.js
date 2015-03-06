/**
 * Net common routines.
 */

import bitmessage from "bitmessage";
import pkg from "../../package.json";

export const DEFAULT_STREAM = 1;

export const MY_USER_AGENT = bitmessage.UserAgent.encodeSelfWith({
  name: pkg.name,
  version: pkg.version,
});
