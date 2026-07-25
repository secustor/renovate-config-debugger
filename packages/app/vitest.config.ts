import { renovateShims } from "@renovate-config-visualizer/engine/vite-plugin";
import { defineConfig } from "vitest/config";

/**
 * Two projects:
 * - "unit" (roadmap 029): the app's pure-module unit tests — no DOM, no React,
 *   no engine chunk, so they need neither jsdom nor the browser module graph.
 *   A dedicated config, because vitest would otherwise load `vite.config.ts`
 *   and with it the renovate shim plugin that exists only for the browser
 *   bundle.
 * - "render" (roadmap 032): the keystroke render-count measurement — mounts
 *   the real App under jsdom (real engine, real panels; only the CodeMirror
 *   editor is stubbed) and counts which panels re-render while typing. This
 *   project DOES need the shim plugin: the preset tree and provenance events
 *   only exist in the shimmed module graph (the shims are what emit them),
 *   exactly like the engine's own "shimmed" test project — hence also the
 *   inlined renovate deps and the generous timeout.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        plugins: [renovateShims()],
        test: {
          name: "render",
          include: ["src/**/*.test.tsx"],
          environment: "jsdom",
          testTimeout: 240_000,
          hookTimeout: 240_000,
          server: {
            deps: {
              // without this, Node loads renovate/dist natively and the shim
              // plugin never sees its imports (same as the engine's config)
              inline: [/renovate/],
            },
          },
        },
      },
    ],
  },
});
