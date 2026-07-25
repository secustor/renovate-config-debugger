import { expect, test } from "@playwright/test";
import { openTab, runAndAwaitResult } from "./helpers";

/**
 * Roadmap 026 — `$schema` is standard practice in renovate.json (the app's
 * own default config ships it) and Renovate's validator explicitly ignores
 * it, but it used to fall into the unknown-option styling because it's
 * absent from renovate's own option metadata. Guards the Effective config
 * row directly: no red "unknown option" marker, and the hover card explains
 * what the key is for instead of calling it a possible typo.
 */
test("$schema renders as a known option in Effective config, not an unknown-option marker", async ({
  page,
}) => {
  await page.goto("/");
  // Default editor content ships $schema and only extends config:recommended
  // (bundled with Renovate), so this needs no network.
  await expect(page.locator(".cm-content")).toContainText("$schema");
  await runAndAwaitResult(page);
  await openTab(page, "effective");

  const effectiveConfig = page
    .locator(".card")
    .filter({ has: page.locator(".card-title", { hasText: "Effective config" }) });
  await expect(effectiveConfig).toBeVisible();

  // Narrow to just the $schema row.
  await effectiveConfig.getByPlaceholder("Filter keys…").fill("schema");
  const schemaKey = effectiveConfig.locator(".prov-row .opt-key", { hasText: "$schema" }).first();
  await expect(schemaKey).toBeVisible();

  const className = await schemaKey.getAttribute("class");
  expect(className).not.toMatch(/\bunknown\b/);
  expect(className).toMatch(/\bknown\b/);

  await schemaKey.hover();
  const card = page.locator(".option-card").first();
  await expect(card).toBeVisible({ timeout: 5_000 });
  await expect(card).toContainText("ignored by Renovate itself");
  await expect(card).not.toContainText("possibly a typo");
});
