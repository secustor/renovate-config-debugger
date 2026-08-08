import { fileURLToPath } from "node:url";
import { renovateShims } from "@renovate-config-debugger/engine/vite-plugin";
import { defineConfig } from "vitest/config";

/**
 * The CLI's tests run its commands in-process against the SAME module graph
 * the `rcd` bin boots (shim plugin + inlined renovate), so an output shape or
 * an exit code is asserted against the real engine — vitest is simply a second
 * host for the runner. Thin by design: the golden↔shimmed parity suite in
 * `packages/engine` is what proves the resolution semantics; these tests cover
 * argument parsing, output shapes and exit codes.
 *
 * A test sits next to the module it covers, so the suites live under `src/`.
 * The exception is `test/bin.test.ts`: `bin/rcd.mjs` is not a `src` module, and
 * `bin/` is published payload that carries no tests. `test/fixtures/` are the
 * configs both regimes feed in.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../app/src", import.meta.url)),
    },
  },
  plugins: [renovateShims()],
  // The MCP SDK ships sourcemaps whose sources it does not ship; Vite warns
  // once per module and buries the test output. Errors still print.
  logLevel: "error",
  test: {
    name: "cli",
    include: ["src/**/*.test.ts", "test/*.test.ts"],
    environment: "node",
    // the first test to resolve a large internal preset pays the lazy
    // transform+import of renovate's preset data modules
    testTimeout: 60_000,
    server: {
      deps: {
        inline: [/renovate/],
      },
    },
  },
});
