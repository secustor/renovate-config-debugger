import { expect, test } from "@playwright/test";
import { runAndAwaitResult, setEditorContent } from "./helpers";

/**
 * Roadmap 053 — the suite must not be a traffic source.
 *
 * CI serves the Pages `dist` (measurement id inlined by the build job) on
 * localhost, and every Playwright context is cookie-less, so before the
 * hostname guard each test in this suite registered as a new GA user. This
 * spec asserts the guard from the outside: no request ever leaves for Google's
 * analytics hosts, and gtag's `dataLayer` is never created.
 *
 * Against a locally built `dist` the assertion is vacuous — no id is inlined
 * without `VITE_GA_MEASUREMENT_ID`, so nothing would load either way. It bites
 * exactly where the bug lived: CI, and a deliberate local repro
 * (`VITE_GA_MEASUREMENT_ID=G-TEST1234 pnpm --filter …/app build`), where it
 * fails without the guard.
 */

const ANALYTICS_HOSTS = ["googletagmanager.com", "google-analytics.com", "analytics.google.com"];

test("never loads analytics when served from localhost", async ({ page }) => {
  const analyticsRequests: string[] = [];
  page.on("request", (request) => {
    const { hostname } = new URL(request.url());
    if (ANALYTICS_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
      analyticsRequests.push(request.url());
    }
  });

  await page.goto("/");
  // A full run, not just first paint: the injector runs at module scope, but a
  // regression that moved it behind the pipeline would still be caught. The
  // config resolves without fetching any preset, so the only requests that can
  // leave the page are the app's own.
  await setEditorContent(
    page,
    '{\n  "packageRules": [{ "matchPackageNames": ["react"], "groupName": "react" }]\n}',
  );
  await runAndAwaitResult(page);

  expect(analyticsRequests).toEqual([]);
  const hasDataLayer = await page.evaluate(() => "dataLayer" in window);
  expect(hasDataLayer).toBe(false);
});
