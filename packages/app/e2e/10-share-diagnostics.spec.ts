import { expect, test } from "@playwright/test";
import {
  encodeShareFragment,
  encodeShareToken,
  garbleShareToken,
  PACKAGE_RULES_CONFIG,
  truncateShareToken,
} from "./fixtures";

/**
 * Roadmap 027 — share-link failure diagnostics. A `#config=` token that can't
 * be decoded must surface a prominent, unmissable banner (not the small
 * dismissable notice), tailored to the failure mode, and must never leave the
 * app silently sitting on the default config as if nothing was opened.
 */

const banner = ".share-error-banner";
const DEFAULT_CONFIG_MARKER = "config:recommended";

test("a truncated token surfaces the cut-off banner", async ({ page }) => {
  const token = await encodeShareToken({ config: PACKAGE_RULES_CONFIG });
  await page.goto(`#config=${truncateShareToken(token)}`);

  await expect(page.locator(banner)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(banner)).toContainText(/cut off/i);
  await expect(page.locator(banner)).toContainText(/whole URL was copied/i);
});

test("a garbled token surfaces the damaged-link banner", async ({ page }) => {
  const token = await encodeShareToken({ config: PACKAGE_RULES_CONFIG });
  await page.goto(`#config=${garbleShareToken(token)}`);

  await expect(page.locator(banner)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(banner)).toContainText(/damaged/i);
});

test("a valid pre-027 token without the integrity field still loads and runs", async ({ page }) => {
  const fragment = await encodeShareFragment(
    { config: PACKAGE_RULES_CONFIG },
    { integrity: false },
  );
  await page.goto(fragment);

  // Decodes, auto-runs, and shows no error banner — backward compat holds.
  await expect(page.locator(".cm-content")).toContainText("matchPackageNames", {
    timeout: 15_000,
  });
  await expect(page.locator(".stage-timeline")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(banner)).toHaveCount(0);
});

test("a broken token never leaves the app silently on the default config", async ({ page }) => {
  const token = await encodeShareToken({ config: PACKAGE_RULES_CONFIG });
  await page.goto(`#config=${truncateShareToken(token)}`);

  // The banner is shown (the failure is announced, not silent) ...
  await expect(page.locator(banner)).toBeVisible({ timeout: 15_000 });
  // ... while the app falls back to the default config without auto-running a
  // pipeline off a config the sender never actually shared.
  await expect(page.locator(".cm-content")).toContainText(DEFAULT_CONFIG_MARKER);
  await expect(page.locator(".stage-timeline")).toHaveCount(0);
});
