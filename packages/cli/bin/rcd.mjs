#!/usr/bin/env node
/**
 * The in-repo `rcd` bin (roadmap 058).
 *
 * It boots Vite's SSR module runner with the engine's own shim plugin active
 * and loads `src/main.ts` through it, so the CLI runs the EXACT module graph
 * the browser bundle and the shimmed test suite use. That is the whole point:
 * the preset tree and the provenance events are reconstructed from Renovate's
 * log stream by the logger shim, so a plain Node import of the engine — fast
 * as it is — returns `presetTree: undefined` and no provenance.
 *
 * Plain JavaScript, and the only file that touches the process: everything
 * under `src/` is transformed with `define: { "process.env": "{}" }` (the shim
 * plugin sets it for the browser), so argv, env and stdio have to be handed in
 * as data.
 */
import { createServer } from "vite";

const configFile = new URL("../vite.config.ts", import.meta.url).pathname;

const server = await createServer({
  configFile,
  logLevel: "error",
  server: { middlewareMode: true, hmr: false, watch: null },
});

try {
  const { main } = await server.ssrLoadModule("/src/main.ts");
  // NOT `process.exit(code)`: on a pipe, stdout is asynchronous, and a hard
  // exit discards everything still queued — `rcd run … --format json | cat`
  // used to stop at the 64 KB pipe buffer and report success. Setting the code
  // instead answers with the same number and lets the loop drain the writes.
  process.exitCode = await main(process.argv.slice(2), {
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
    onDisconnect,
  });
} finally {
  await server.close();
}

/**
 * The stdio peer going away, as an event `src/` can observe without touching a
 * process global. A long-lived command — one that serves a peer rather than
 * answering and returning — has no other way to learn that the peer left.
 *
 * Registration is per call and never eager — a SIGINT/SIGTERM listener is a
 * libuv handle that refs the loop, so a command that does not ask to be told
 * must not pay for one. Returns the disposer that takes them all back off,
 * which the caller runs once the wait is over however it ended.
 */
function onDisconnect(callback) {
  const off = () => {
    process.stdin.off("end", fire);
    process.stdin.off("close", fire);
    process.off("SIGINT", fire);
    process.off("SIGTERM", fire);
  };
  const fire = () => {
    off();
    callback();
  };
  process.stdin.on("end", fire);
  process.stdin.on("close", fire);
  process.on("SIGINT", fire);
  process.on("SIGTERM", fire);
  return off;
}
