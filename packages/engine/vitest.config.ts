import { defineConfig } from "vitest/config";
import { renovateShims } from "./src/shims/vite-plugin-renovate-shims";

/**
 * Three projects. The first two share the same fixtures and file snapshots:
 * - "golden": real renovate modules, no shims — produces the reference
 *   snapshots straight from Renovate's own code.
 * - "shimmed": the exact module graph the browser bundle uses (shim plugin +
 *   renovate inlined through the Vite pipeline) — must match the golden
 *   snapshots, proving the shims don't alter behavior.
 * - "packaging": neither graph, but the tarball `pnpm publish` would upload
 *   (roadmap 056) — packs, unpacks and type-checks a scratch consumer against
 *   it. Split out because it runs a build and a second tsc, which the other
 *   two must not pay for.
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
          include: [
            "test/global-inherit.shimmed.test.ts",
            "test/pipeline.shimmed.test.ts",
            "test/preset-fetchers.test.ts",
            "test/provenance.shimmed.test.ts",
            "test/repo-config.test.ts",
            "test/resolved-config.shimmed.test.ts",
            "test/simulate-package-rules.shimmed.test.ts",
            "test/version.shimmed.test.ts",
          ],
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
      {
        test: {
          name: "packaging",
          include: ["test/*.pack.test.ts"],
          environment: "node",
          // one `pnpm pack` (tsc build + tarball) and one tsc over the scratch
          // consumer, both cold on a CI runner
          testTimeout: 300_000,
          hookTimeout: 300_000,
        },
      },
    ],
  },
});
