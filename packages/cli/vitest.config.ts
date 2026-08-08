import { fileURLToPath } from "node:url";
import { renovateShims } from "@renovate-config-debugger/engine/vite-plugin";
import { defineConfig } from "vitest/config";

const srcAlias = { "@": fileURLToPath(new URL("../app/src", import.meta.url)) };

/** The engine surface of the BUILT bundle — see `src/engine-surface.ts`. */
const bundledEngine = fileURLToPath(new URL("./dist/engine-surface.js", import.meta.url));

/**
 * Two projects:
 *
 * - "cli" — the CLI's commands run in-process against the same module graph
 *   the `rcv` bin boots (shim plugin + inlined renovate), so an output shape
 *   or an exit code is asserted against the real engine. Thin by design: the
 *   golden↔shimmed parity suite in `packages/engine` owns the resolution
 *   semantics.
 * - "bundle" (roadmap 059) — the parity PROOF for the published artifact. It
 *   runs the engine's own `*.shimmed.test.ts` files, which write and compare
 *   the golden file snapshots, with `../src/index` pointed at
 *   `dist/engine-surface.js`. So "the bundle is the same module graph" is
 *   tested against the thing that ships rather than inferred from both having
 *   been built with the same plugin. Needs `pnpm build` first; CI runs it
 *   right after, and it is NOT part of `pnpm test` for exactly that reason.
 */
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: srcAlias },
        plugins: [renovateShims()],
        // The MCP SDK ships sourcemaps whose sources it does not ship; Vite
        // warns once per module and buries the test output. Errors still print.
        logLevel: "error",
        test: {
          name: "cli",
          include: ["test/*.test.ts"],
          environment: "node",
          // the first test to resolve a large internal preset pays the lazy
          // transform+import of renovate's preset data modules
          testTimeout: 60_000,
          server: { deps: { inline: [/renovate/] } },
        },
      },
      {
        resolve: {
          alias: [
            // The two specifiers the engine's shimmed tests reach the engine
            // through. Everything else in those files — the fixtures, the
            // `./helpers` import, the `renovate/dist/**` oracle imports they
            // compare AGAINST — resolves exactly as it does in the engine's
            // own run.
            { find: /^\.\.\/src\/index$/, replacement: bundledEngine },
            { find: /^\.\.\/src\/version$/, replacement: bundledEngine },
          ],
        },
        plugins: [renovateShims()],
        test: {
          name: "bundle",
          include: ["../engine/test/*.shimmed.test.ts"],
          environment: "node",
          testTimeout: 60_000,
          server: { deps: { inline: [/renovate/] } },
        },
      },
    ],
  },
});
