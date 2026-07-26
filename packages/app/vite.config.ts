import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { renovateShims } from "@renovate-config-visualizer/engine/vite-plugin";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/renovate-config-visualizer/" : "/",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [react(), renovateShims()],
  build: {
    /**
     * Roadmap 037: `light-dark()` MUST reach the browser intact. At Vite's
     * default CSS target ("baseline-widely-available", ~30 months behind) the
     * CSS pipeline downlevels every `light-dark()` into a
     * `--lightningcss-light` / `--lightningcss-dark` custom-property pair
     * switched by `@media (prefers-color-scheme: dark)` — a polyfill only the
     * OS can drive. The whole app then silently ignores `color-scheme`, so the
     * theme switcher changed nothing in a production build while working
     * perfectly in dev. Pinned to the browsers that ship `light-dark()`
     * natively (Chrome 123 / Firefox 120 / Safari 17.5 — Baseline 2024-05),
     * which is also where the app's container queries and `color-mix()`
     * already put the floor.
     */
    cssTarget: ["chrome123", "firefox120", "safari17.5"],
  },
});
