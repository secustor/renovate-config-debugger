#!/usr/bin/env node
/**
 * The PUBLISHED `rcv` (roadmap 059) — `pnpm dlx @renovate-config-debugger/cli …`.
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
import { fileURLToPath } from "node:url";
import { processIo } from "./io.mjs";

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
    "rcv: this bin needs the built bundle (dist/main.js).\n" +
      "     In this repository, run `pnpm --filter @renovate-config-debugger/cli build`,\n" +
      "     or use the dev runner: `pnpm --filter @renovate-config-debugger/cli rcv …`.\n",
  );
  process.exit(1);
}

const { main } = await import(bundle.href);
process.exit(await main(process.argv.slice(2), processIo()));
