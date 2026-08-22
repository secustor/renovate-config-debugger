import { expect, test } from "@playwright/test";
import { openTab, runAndAwaitResult, tabPanel } from "./helpers";

/**
 * Roadmap 051 — the effective config's As-JSON rendering: the resolved config
 * as a copyable document, with hosted presets inlined and internal presets
 * kept as `extends` references (or everything expanded, optionally hydrated
 * with the defaults). The default editor config extends `config:recommended`
 * — an internal preset — so the keep-internal document must keep it
 * referenced while the full document must consume it.
 */

test("the As JSON view keeps internal presets referenced, expands fully on demand, and hydrates defaults", async ({
  page,
}) => {
  await page.goto("/");
  await runAndAwaitResult(page);
  await openTab(page, "effective");
  const panel = tabPanel(page, "effective");

  // The provenance rows are the default rendering — since 075 (iteration 5)
  // cut into one section per layer that DECIDED a key, the reader's own config
  // first.
  await expect(panel.locator(".prov-row").first()).toBeVisible({ timeout: 30_000 });
  await expect(panel.locator(".prov-section-repo")).toBeVisible();
  await expect(panel.locator(".prov-section-preset")).toBeVisible();

  await panel.getByRole("radio", { name: "As JSON" }).click();
  // Roadmap 082: ONE toolbar row in both views, so the key filter stays on
  // screen — inert, because it narrows rows and this document is copied whole.
  // The output options are what this view adds under it.
  await expect(panel.locator("#resolved-expand")).toBeVisible();
  await expect(panel.locator(".prov-filter-input")).toBeDisabled();

  // keep-internal (the default): config:recommended stays a reference.
  const doc = panel.locator("pre.config-view");
  await expect(doc).toContainText('"extends"');
  await expect(doc).toContainText("config:recommended");
  await expect(panel.getByRole("button", { name: "Copy resolved config" })).toBeVisible();
  // Defaults cannot be written into a document that still extends presets.
  const defaults = panel.getByRole("checkbox", { name: /include defaults/ });
  await expect(defaults).toBeDisabled();

  // Fully expanded: no extends survive, the preset's contribution is inline.
  await panel.locator("#resolved-expand").selectOption("full");
  await expect(doc).not.toContainText('"extends"');
  await expect(defaults).toBeEnabled();

  // Defaults hydration writes out pure defaults the bare document omits.
  await expect(doc).not.toContainText('"branchPrefix"');
  await defaults.check();
  await expect(doc).toContainText('"branchPrefix"');

  // Switching back restores the provenance rows, and the filters go live again.
  await panel.getByRole("radio", { name: "By key" }).click();
  await expect(panel.locator(".prov-row").first()).toBeVisible();
  await expect(panel.locator(".prov-section-repo")).toBeVisible();
  await expect(panel.locator(".prov-filter-input")).toBeEnabled();
});
