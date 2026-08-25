/**
 * Minimal `node:util` stand-in for the dep prebundle (roadmap 087).
 *
 * The npm-extraction graph (find-packages and friends) calls
 * `util.promisify(fs.something)` at module scope. With fs stubbed empty (see
 * graceful-fs-stub.cjs) Node's own promisify would throw on the undefined
 * argument at LOAD time — this one defers: it always hands back a function,
 * and only an actual call of a missing original fails. Nothing here runs
 * during single-file extraction; loading is the entire job.
 */
function promisify(original) {
  if (typeof original === "function") {
    return (...args) =>
      new Promise((resolve, reject) => {
        original(...args, (err, value) => (err ? reject(err) : resolve(value)));
      });
  }
  return () => {
    throw new TypeError("fs is not available in the browser");
  };
}

module.exports = {
  promisify,
  debuglog: () => () => {},
  deprecate: (fn) => fn,
  format: (...args) => args.map(String).join(" "),
  inherits: (ctor, superCtor) => {
    Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
  },
  types: {},
};
