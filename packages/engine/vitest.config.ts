import { defineConfig } from "vitest/config";
import { renovateShims } from "./src/shims/vite-plugin-renovate-shims";

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
          // matches exactly one of the two globs.
          include: ["test/*.shimmed.test.ts"],
          environment: "node",
          server: {
            deps: {
              // without this, Node loads renovate/dist natively and the shim
              // plugin never sees its imports. The pattern matches the
              // RENOVATE PACKAGE's store path, not the bare word: this repo's
              // own absolute path contains "renovate", so a bare /renovate/
              // inlines every node_modules dep — which ground the manager-
              // extraction graph's CJS deps (find-packages, @pnpm/*) through
              // the vite pipeline for minutes (078).
              inline: [/node_modules\/(\.pnpm\/)?renovate[@/]/],
            },
          },
        },
      },
    ],
  },
});
