import { expect, test } from "@playwright/test";
import { PACKAGE_RULES_CONFIG, SEMANTIC_COMMITS_CONFIG } from "./fixtures";
import { openTab, runAndAwaitResult, setEditorContent } from "./helpers";

/**
 * Roadmap 024 — stage nodes signal what each stage did. A config that
 * triggers a migration renders the Migrate node in its amber "changed" state
 * with a delta; a config with nothing to migrate renders it green/clean.
 * Both glyphs are distinguished by shape too, not just color (see index.css).
 *
 * Roadmap 075 (iteration 4) restyled the Pipeline tab's chip row into the
 * design's rail: same 024 vocabulary, new DOM — `.stage-rail-btn[data-stage]`
 * with a glyph and a delta line instead of a chip with a `·N` count.
 */
test("the Migrate node shows amber with a delta when it rewrote the config", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cm-content")).toContainText("config:recommended");

  await setEditorContent(page, SEMANTIC_COMMITS_CONFIG);
  await runAndAwaitResult(page);
  // Roadmap 028: the stage rail is the Pipeline tab's stage selector.
  await openTab(page, "pipeline");

  // Roadmap 090: the tab leads with the phase picker, and the stage rail is
  // what the Config phase — the one selected on arrival — shows. Which phases
  // exist and which are disabled is `PhasePicker.test.tsx`'s claim, not this
  // spec's; all this one needs is that the rail below is the Config phase's.
  await expect(
    page
      .getByRole("radiogroup", { name: "Pipeline phase" })
      .locator("button.active .phase-seg-name"),
  ).toHaveText("Config");

  const migrateNode = page.locator('.stage-rail-btn[data-stage="migrate"]');
  await expect(migrateNode).toBeVisible();
  await expect(migrateNode.locator(".stage-rail-glyph.changed")).toBeVisible();
  await expect(migrateNode.locator(".stage-rail-glyph.clean")).toHaveCount(0);
  await expect(migrateNode.locator(".stage-rail-delta.warn")).toHaveText("Δ 1");
  await expect(migrateNode).toHaveAttribute("aria-label", /migration applied/i);

  // The stage card names the same outcome in words (075 iteration 4).
  await migrateNode.click();
  await expect(page.locator("#panel-pipeline .card-title").first()).toContainText(
    "1 deprecated option rewritten",
  );

  // The rule is documented in the stage's own hover card, not just implied
  // by the color.
  await migrateNode.hover();
  const card = page.locator(".glossary-card");
  await expect(card).toBeVisible({ timeout: 5_000 });
  await expect(card).toContainText(/amber/i);
});

test("the Migrate node stays green/clean with a dimmed zero when nothing was migrated", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".cm-content")).toContainText("config:recommended");

  await setEditorContent(page, PACKAGE_RULES_CONFIG);
  await runAndAwaitResult(page);
  // Roadmap 028: the stage rail is the Pipeline tab's stage selector.
  await openTab(page, "pipeline");

  const migrateNode = page.locator('.stage-rail-btn[data-stage="migrate"]');
  await expect(migrateNode).toBeVisible();
  await expect(migrateNode.locator(".stage-rail-glyph.clean")).toBeVisible();
  await expect(migrateNode.locator(".stage-rail-glyph.changed")).toHaveCount(0);
  // Nothing to report reads as a dimmed zero, never as an amber count.
  await expect(migrateNode.locator(".stage-rail-delta.dim")).toHaveText("Δ 0");
  await expect(migrateNode.locator(".stage-rail-delta.warn")).toHaveCount(0);
  await expect(migrateNode).toHaveAttribute("aria-label", /nothing to migrate/i);
});
