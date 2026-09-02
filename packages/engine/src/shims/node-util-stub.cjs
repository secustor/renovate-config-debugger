/**
 * Minimal `node:util` stand-in for the dep prebundle (roadmap 087) — and, under
 * the CLI's `ssr.noExternal: true` build, for every inlined `node:util` consumer
 * in the shipped bundle, commander's help renderer included.
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

// Node's own ANSI/VT pattern. commander strips escapes to measure help column
// widths, so a missing export breaks `--help` in the built CLI and nowhere else.
const ansi = new RegExp(
  "[\\u001B\\u009B][[\\]()#;?]*" +
    "(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*" +
    "|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)" +
    "|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))",
  "g",
);

module.exports = {
  promisify,
  stripVTControlCharacters: (str) => String(str).replace(ansi, ""),
  debuglog: () => () => {},
  deprecate: (fn) => fn,
  format: (...args) => args.map(String).join(" "),
  inherits: (ctor, superCtor) => {
    Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
  },
  types: {},
};
