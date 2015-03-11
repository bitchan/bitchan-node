/**
 * Simple abstraction on top of `storage.inventory`.
 */

import * as storage from "./storage";
import conf from "./config";
import {getLogger} from "./log";

const logError = getLogger("inventory", "error");

/** Just an alias for `storage.inventory.getVectors`. */
export function getVectors(stream) {
  return storage.inventory
    .getVectors(null, stream)
    .catch(function(err) {
      logError("Error in `inventory.getVectors`: %s", err.message);
      throw err;
    });
}

/** Pick out vectors we haven't yet known about. */
export function getNewVectors(vectors) {
  // Execute this action inside separate transaction because
  // `inventory.getDups` may produce several SQL queries.
  return storage.transaction(function(trx) {

    return storage.inventory.getDups(trx, vectors).then(function(dups) {
      dups = new Set(dups.map(v => v.toString("hex")));
      return vectors.filter(v => !dups.has(v.toString("hex")));
    });

  }).debug(conf.get("debug") && vectors.length <= 5).catch(function(err) {
    logError("Error in `inventory.getNewVectors`: %s", err.message);
    throw err;
  });
}

/** Try to add object to the store and ignore duplicates. */
export function add(object) {
  // NOTE(Kagami): Insert may fail for another reason (e.g. some DB
  // internal error). But pg's version of insert-when-not-exists is
  // still vulnerable to the race condition (see
  // <https://stackoverflow.com/a/13342031>) so it's better to catch
  // errors here anyway.
  return storage.inventory
    .add(null, object)
    .then(() => true)
    .catch(() => false);
}
