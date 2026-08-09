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

let code = 1;
try {
  const { main } = await server.ssrLoadModule("/src/main.ts");
  code = await main(process.argv.slice(2), {
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
  });
} finally {
  await server.close();
}

process.exit(code);
