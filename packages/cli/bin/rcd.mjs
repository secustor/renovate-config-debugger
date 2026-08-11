#!/usr/bin/env node
/**
 * The PUBLISHED `rcd` (roadmap 059) — `pnpm dlx @renovate-config-debugger/cli …`.
 *
 * No Vite, no transform pipeline: `dist/main.js` is the same shimmed module
 * graph the dev runner builds on demand, baked at publish time by
 * `vite build --ssr` with `renovateShims()` active. Renovate is inlined into
 * it, so the package has no runtime dependencies and startup is a plain import.
 *
 * The bin is deliberately NOT part of the bundle: the graph is transformed
 * with `define: { "process.env": "{}" }`, so this file is the only place that
 * can read the real environment (see `bin/io.mjs`).
 */
import { existsSync } from "node:fs";
import { setSourceMapsSupport } from "node:module";
import { fileURLToPath } from "node:url";
import { processIo } from "./io.mjs";

// The bundle ships with sourcemap: true precisely so a crash trace reads as
// original TS, not `dist/main.js` positions — but Node ignores the shipped
// `.map` files unless this is switched on before the bundle is imported.
setSourceMapsSupport(true);

// One of renovate's transitive dependencies still reaches for `node:punycode`.
// Inlined into the bundle, its deprecation warning is about code no consumer
// of this package can change, and it would otherwise land on the stderr that
// agents read. Every other warning is printed exactly as Node would — which
// is why the default handler has to go first: a `warning` listener ADDS to it
// rather than replacing it, so registering one alone would print twice.
process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (warning.name === "DeprecationWarning" && warning.message.includes("punycode")) {
    return;
  }
  process.stderr.write(`${warning.stack ?? `${warning.name}: ${warning.message}`}\n`);
});

const bundle = new URL("../dist/main.js", import.meta.url);

if (!existsSync(fileURLToPath(bundle))) {
  process.stderr.write(
    "rcd: this bin needs the built bundle (dist/main.js).\n" +
      "     In this repository, run `pnpm --filter @renovate-config-debugger/cli build`,\n" +
      "     or use the dev runner: `pnpm --filter @renovate-config-debugger/cli rcd …`.\n",
  );
  process.exit(1);
}

const { main } = await import(bundle.href);

// NOT `process.exit(code)`: on a pipe, stdout is asynchronous, and a hard exit
// discards everything still queued — `rcd run … --format json | cat` used to
// stop at the 64 KB pipe buffer and report success. Setting the code instead
// answers with the same number and lets the loop drain the writes first.
process.exitCode = await main(process.argv.slice(2), processIo());
