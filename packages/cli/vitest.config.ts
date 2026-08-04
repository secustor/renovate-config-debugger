import { fileURLToPath } from "node:url";
import { renovateShims } from "@renovate-config-debugger/engine/vite-plugin";
import { defineConfig } from "vitest/config";

/**
 * The CLI's tests run its commands in-process against the SAME module graph
 * the `rcv` bin boots (shim plugin + inlined renovate), so an output shape or
 * an exit code is asserted against the real engine — vitest is simply a second
 * host for the runner. Thin by design: the golden↔shimmed parity suite in
 * `packages/engine` is what proves the resolution semantics; these tests cover
 * argument parsing, output shapes and exit codes.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../app/src", import.meta.url)),
    },
  },
  plugins: [renovateShims()],
  test: {
    name: "cli",
    include: ["test/*.test.ts"],
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
