/**
 * Simple abstraction on top of `storage.inventory`.
 */

import * as storage from "./storage";
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

  }).catch(function(err) {
    logError("Error in `inventory.getNewVectors`: %s", err.message);
    throw err;
  });
}
