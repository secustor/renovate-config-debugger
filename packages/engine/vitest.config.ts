import { defineConfig } from "vitest/config";
import { RENOVATE_INLINE, renovateShims } from "./src/shims/vite-plugin-renovate-shims";

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
          // `test/*.node.test.ts` are the suites that need the untouched
          // renovate modules as their reference; `src/**/*.test.ts` are the
          // colocated suites of modules that need no shims at all (roadmap
          // 084 follow-up). Both regimes are "real renovate, no plugin", so
          // they share this project.
          include: ["test/*.node.test.ts", "src/**/*.test.ts"],
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
          // Globbed, not hand-listed: a new shimmed test that missed a stale
          // include list would run in NO project and pass silently — the same
          // failure class the headless walker's regex had (roadmap 084).
          // test/project-coverage.node.test.ts asserts every test file
          // matches exactly one of the project globs.
          include: ["test/*.shimmed.test.ts"],
          environment: "node",
          server: { deps: { inline: [...RENOVATE_INLINE] } },
        },
      },
    ],
  },
});
