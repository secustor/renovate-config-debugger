import { defineConfig } from "vitest/config";
import { renovateShims } from "./src/shims/vite-plugin-renovate-shims";
import { SHIMMED_TESTS } from "./vitest.shimmed-tests";

/**
 * Two projects sharing the same fixtures and file snapshots:
 * - "golden": real renovate modules, no shims — produces the reference
 *   snapshots straight from Renovate's own code.
 * - "shimmed": the exact module graph the browser bundle uses (shim plugin +
 *   renovate inlined through the Vite pipeline) — must match the golden
 *   snapshots, proving the shims don't alter behavior.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "golden",
          include: ["test/*.node.test.ts"],
          environment: "node",
        },
      },
      {
        plugins: [renovateShims()],
        test: {
          name: "shimmed",
          // the first test to resolve a large internal preset (e.g.
          // config:recommended) pays the lazy vite-node transform+import of
          // renovate's preset data modules — 4-6s on 2-core CI runners
          testTimeout: 30_000,
          // Shared with packages/cli's bundle project, so the parity proof
          // cannot cover less than this suite does.
          include: SHIMMED_TESTS,
          environment: "node",
          server: {
            deps: {
              // without this, Node loads renovate/dist natively and the shim
              // plugin never sees its imports
              inline: [/renovate/],
            },
          },
        },
      },
    ],
  },
});
