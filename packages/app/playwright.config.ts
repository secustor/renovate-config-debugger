import { defineConfig, devices } from "@playwright/test";

/**
 * Roadmap 020 — browser e2e suite.
 *
 * Drives the PRODUCTION build served by `vite preview` (never `vite dev` — the
 * persona study showed dev cold-starts can wedge the first engine import and
 * are not representative of what users get). Chromium only; hard timeouts so a
 * wedged "Running…" fails fast rather than stalling CI.
 *
 * The dist must already be built (`pnpm --filter …/app build`) — the `test:e2e`
 * script builds first locally; CI reuses the dist from its build step.
 *
 * Base path: `vite.config.ts` sets `base: "/renovate-config-visualizer/"` when
 * GITHUB_ACTIONS is set, "/" otherwise. `vite preview` serves under that same
 * base, so the Playwright baseURL must mirror it exactly.
 */
const PORT = 4322;
const BASE = process.env.GITHUB_ACTIONS ? "/renovate-config-visualizer/" : "/";
const BASE_URL = `http://localhost:${PORT}${BASE}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  // Hard per-test ceiling: any hang (e.g. a stuck pipeline) fails well within
  // this. Individual waits below use tighter timeouts so failures are quick.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // A whole-suite ceiling so a wedged server can never stall CI indefinitely.
  globalTimeout: 5 * 60_000,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec vite preview --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
