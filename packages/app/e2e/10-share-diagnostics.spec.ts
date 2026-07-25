import { expect, test } from "@playwright/test";
import {
  configChecksum,
  encodeRawShareToken,
  encodeShareFragment,
  encodeShareToken,
  garbleShareToken,
  PACKAGE_RULES_CONFIG,
  RENOVATE_VERSION,
  truncateShareToken,
} from "./fixtures";
import { resultsPanel } from "./helpers";

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
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
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
  await expect(resultsPanel(page)).toHaveCount(0);
});

/**
 * Roadmap 030 — a payload that decodes cleanly (valid base64/deflate/JSON,
 * a known version, a string `config`) but fails the new field-level schema
 * maps onto the SAME "damaged" reason as a garbled token: the version is
 * already known-good at that point, so a schema failure is transit/tamper
 * damage, not a future-version payload. Built with `encodeRawShareToken`
 * since these fields (a `__proto__` own key, a `javascript:` endpoint) are
 * not expressible through the normal fixture builder — see its doc comment.
 */
test("a payload with a prototype-polluted globalConfig shows the damaged banner", async ({
  page,
}) => {
  const config = PACKAGE_RULES_CONFIG;
  const json =
    `{"v":2,"renovate":${JSON.stringify(RENOVATE_VERSION)},"config":${JSON.stringify(config)},` +
    `"fileName":"renovate.json","c":${JSON.stringify(configChecksum(config))},` +
    `"globalConfig":{"__proto__":{"pwned":true},"platform":"gitlab"}}`;
  const token = await encodeRawShareToken(json);
  await page.goto(`#config=${token}`);

  await expect(page.locator(banner)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(banner)).toContainText(/damaged/i);
  await expect(page.locator(".cm-content")).toContainText(DEFAULT_CONFIG_MARKER);
  await expect(resultsPanel(page)).toHaveCount(0);
});

test("a link with a javascript: endpoint is refused (damaged banner)", async ({ page }) => {
  const config = PACKAGE_RULES_CONFIG;
  const json =
    `{"v":2,"renovate":${JSON.stringify(RENOVATE_VERSION)},"config":${JSON.stringify(config)},` +
    `"fileName":"renovate.json","c":${JSON.stringify(configChecksum(config))},` +
    `"endpoint":"javascript:alert(1)"}`;
  const token = await encodeRawShareToken(json);
  await page.goto(`#config=${token}`);

  await expect(page.locator(banner)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(banner)).toContainText(/damaged/i);
  // Refused outright — never auto-runs a pipeline carrying the bad endpoint.
  await expect(resultsPanel(page)).toHaveCount(0);
});
