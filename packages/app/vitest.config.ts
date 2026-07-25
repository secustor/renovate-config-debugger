import { defineConfig } from "vitest/config";

/**
 * Roadmap 029: the app's pure-module unit tests — no DOM, no React, no engine
 * chunk, so they need neither jsdom nor the browser module graph. A dedicated
 * config, because vitest would otherwise load `vite.config.ts` and with it the
 * renovate shim plugin that exists only for the browser bundle.
 */
export default defineConfig({
  test: {
    name: "unit",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
