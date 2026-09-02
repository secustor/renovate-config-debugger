import { defineConfig } from "vitest/config";

/**
 * The repo-level specs' vitest config: every `.spec.ts` under `tools/`.
 *
 * NOT named `vitest.config.ts`: vitest walks UP from a package looking for one,
 * and `packages/oauth-worker` has none of its own — a root config by that name
 * is adopted by it and then finds no tests. Named this way it is invisible to
 * discovery, and `pnpm test:tools` passes it explicitly.
 *
 * Every other suite in this repo belongs to a workspace package and runs from
 * that package's own config (`pnpm -r test`). `tools/` is deliberately not a
 * package — no build, no dependencies of its own, and its test helpers are
 * imported only by the app's suites through the `@tools/*` alias, never by
 * production code — so its specs have nowhere else to run.
 *
 * Named `*.spec.ts` rather than `*.test.ts`, matching the upstream oxlint
 * plugin convention these rules follow. That also keeps them clear of the
 * filename globs the packages use to assign tests to projects, which
 * `packages/app/src/vitest-projects.test.ts` and the engine's
 * `project-coverage` test both police.
 */
export default defineConfig({
  test: {
    name: "tools",
    include: ["tools/**/*.spec.ts"],
  },
});
