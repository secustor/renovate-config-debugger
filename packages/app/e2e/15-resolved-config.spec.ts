import { expect, type Locator, test } from "@playwright/test";
import { openTab, runAndAwaitResult, tabPanel } from "./helpers";

/**
 * Roadmap 051 — the effective config's As-JSON rendering: the resolved config
 * as a copyable document, with hosted presets inlined and internal presets
 * kept as `extends` references (or everything expanded, optionally hydrated
 * with the defaults). The default editor config extends `config:recommended`
 * — an internal preset — so the keep-internal document must keep it
 * referenced while the full document must consume it.
 *
 * Roadmap 092: the view is picked in the standard data table's GEAR, not in a
 * segmented control of this tab's own.
 */

/** The gear is a toggle, and a click anywhere outside its panel closes it — so
 *  asking for it to be open is a check, never a second click. */
async function openGear(gear: Locator): Promise<void> {
  if ((await gear.getAttribute("aria-expanded")) !== "true") {
    await gear.click();
  }
}

test("the As JSON view keeps internal presets referenced, expands fully on demand, and hydrates defaults", async ({
  page,
}) => {
  await page.goto("/");
  await runAndAwaitResult(page);
  await openTab(page, "effective");
  const panel = tabPanel(page, "effective");
  const gear = panel.getByRole("button", { name: "Display options" });
  // Scoped to the gear's View fieldset, not the whole panel: the copy button
  // beside the gear is named "Copy effective config as JSON", which contains
  // "As JSON" and makes the bare name ambiguous.
  const views = panel.getByRole("group", { name: "View" });

  // The provenance rows are the default rendering — since 075 (iteration 5)
  // cut into one group per layer that DECIDED a key, the reader's own config
  // first, and since 092 those groups are the data table's.
  await expect(panel.locator(".data-table-row").first()).toBeVisible({ timeout: 30_000 });
  await expect(panel.locator(".data-table-group-title").first()).toHaveText("Your repo config");
  await expect(panel.locator(".data-table-group-pills .pill-preset")).toBeVisible();

  await openGear(gear);
  await views.getByRole("button", { name: "As JSON" }).click();
  // ONE toolbar row in both views, so the key filter stays on screen — inert,
  // because it narrows rows and this document is copied whole. The output
  // options are what this view adds under it.
  await expect(panel.locator("#resolved-expand")).toBeVisible();
  await expect(panel.locator(".data-table-filter")).toBeDisabled();

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
  await openGear(gear);
  await views.getByRole("button", { name: "By key" }).click();
  await expect(panel.locator(".data-table-row").first()).toBeVisible();
  await expect(panel.locator(".data-table-group-title").first()).toHaveText("Your repo config");
  await expect(panel.locator(".data-table-filter")).toBeEnabled();
});
