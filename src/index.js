import {TEST} from "./util";

// You need to load and call this function in order to use
// `nekogrid-node` as a library.
export function init() {
  require("traceur/bin/traceur-runtime");
}

export function start() {
  init();

  let a = 1;
  a = 2;
  console.log(a);

  const square = x => x * x;
  console.log([1,2,3].map(square));

  console.log(TEST);

  var dest = {c: 3};
  Object.assign(dest, {a: 1, b: 2});
  console.log(dest);
}
