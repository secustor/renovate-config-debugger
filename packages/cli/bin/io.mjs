/**
 * The process, as data. Both bins build the same object and hand it to
 * `main(argv, io)`: everything under `src/` is transformed with
 * `define: { "process.env": "{}" }` (the renovate shim plugin sets it, because
 * renovate's `lib/util/env` spreads `process.env` at import time), so the CLI
 * can never read the environment itself.
 */
export function processIo() {
  return {
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
    env: process.env,
    readStdin: async () => {
      const chunks = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks).toString("utf8");
    },
  };
}
