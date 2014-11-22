import fs from "fs";
import path from "path";
import yaml from "js-yaml";

export const config = {};
const NAME = "nekogrid";

function getConfigDir() {
  if (process.env.NODE_ENV === "production") {
    // TODO(Kagami): Make it cross-platform and more flexible.
    return path.join("/etc", NAME);
  } else {
    // XXX(Kagami): This may stop working if we move the util module.
    // It's better to use something like `require.main.filename` but
    // it's not available in `traceur.require` mode.
    return path.join(__dirname, "..", "etc");
  }
}

export function initConfig(filename) {
  if (!filename) {
    filename = path.join(getConfigDir(), NAME + ".yaml");
  }
  const parsed = yaml.safeLoad(fs.readFileSync(filename, "utf-8"));
  Object.assign(config, parsed);
  return config;
}

export function initLog() {
}
