/**
 * Common routines.
 */

"use strict";

exports.popkey = function(obj, key) {
  var value = obj[key];
  delete obj[key];
  return value;
};
