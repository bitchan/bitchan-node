/**
 * Common routines.
 */

exports.assert = function(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
};

exports.popkey = function(obj, key) {
  var value = obj[key];
  delete obj[key];
  return value;
};
