#!/usr/bin/env node
/**
 * The IN-REPO `rcd` (roadmap 058) — `pnpm --filter @renovate-config-debugger/cli rcd …`.
 *
 * It boots Vite's SSR module runner with the engine's own shim plugin active
 * and loads `src/main.ts` through it, so the CLI runs the EXACT module graph
 * the browser bundle and the shimmed test suite use. That is the whole point:
 * the preset tree and the provenance events are reconstructed from Renovate's
 * log stream by the logger shim, so a plain Node import of the engine — fast
 * as it is — returns `presetTree: undefined` and no provenance.
 *
 * Roadmap 059 added the PUBLISHED bin (`bin/rcd.mjs`, dispatching to a
 * prebuilt bundle of this same graph). This one stays: in-repo, an edit is
 * live on the next command with no build step in between.
 */
import { createServer } from "vite";
import { processIo } from "./io.mjs";

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
  // `||`, not a plain assignment: a stdout write failure (bin/io.mjs) sets a
  // nonzero code from outside main, and a truncated answer must not be
  // overwritten with main's 0.
  process.exitCode = (await main(process.argv.slice(2), processIo())) || process.exitCode;
} finally {
  await server.close();
}
