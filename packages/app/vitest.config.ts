import { fileURLToPath } from "node:url";
import { renovateShims } from "@renovate-config-debugger/engine/vite-plugin";
import { defineConfig } from "vitest/config";

const srcAlias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

/**
 * Three projects, assigned purely by filename (`vitest-projects.test.ts` pins
 * the conventions, so a test file can never land in none of them):
 * - "unit" (roadmap 029): the app's pure-module unit tests — no DOM, no React,
 *   no engine chunk, so they need neither jsdom nor the browser module graph.
 *   A dedicated config, because vitest would otherwise load `vite.config.ts`
 *   and with it the renovate shim plugin that exists only for the browser
 *   bundle.
 * - "components": ordinary component and hook tests under jsdom. They render
 *   React and mock (or never touch) the engine, so they want neither the shim
 *   plugin nor the inlined renovate deps — the vast majority of the `.tsx`
 *   tests, kept out of the heavy project so the Stop hook doesn't pay a
 *   shimmed cold start on every turn.
 * - "shimmed" (roadmap 032): the tests that run Renovate's own code — the
 *   keystroke render-count measurement (mounts the real App under jsdom and
 *   counts which panels re-render while typing) and the panel tests that call
 *   `runPipeline` for real. These DO need the shim plugin: the preset tree and
 *   provenance events only exist in the shimmed module graph (the shims are
 *   what emit them), exactly like the engine's own "shimmed" test project —
 *   hence also the inlined renovate deps and the generous timeout.
 */
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: srcAlias },
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias: srcAlias },
        test: {
          name: "components",
          include: ["src/**/*.test.tsx"],
          exclude: ["src/**/*.shimmed.test.tsx"],
          environment: "jsdom",
        },
      },
      {
        resolve: { alias: srcAlias },
        plugins: [renovateShims()],
        test: {
          name: "shimmed",
          include: ["src/**/*.shimmed.test.tsx"],
          environment: "jsdom",
          testTimeout: 240_000,
          hookTimeout: 240_000,
          server: {
            deps: {
              // without this, Node loads renovate/dist natively and the shim
              // plugin never sees its imports (same as the engine's config).
              // The pattern names the renovate PACKAGE's store path, not the
              // bare word — this repo's own absolute path contains "renovate",
              // so /renovate/ would inline every node_modules dep.
              inline: [/node_modules\/(\.pnpm\/)?renovate[@/]/],
            },
          },
        },
      },
    ],
  },
});
