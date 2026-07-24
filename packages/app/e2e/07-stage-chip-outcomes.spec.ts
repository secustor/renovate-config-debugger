import { expect, test } from "@playwright/test";
import { PACKAGE_RULES_CONFIG, SEMANTIC_COMMITS_CONFIG } from "./fixtures";
import { runAndAwaitResult, setEditorContent } from "./helpers";

/**
 * Roadmap 024 — stage chips signal what each stage did. A config that
 * triggers a migration renders the Migrate chip in its amber "changed" state
 * with a step count; a config with nothing to migrate renders it green/clean.
 * Both dots are distinguished by shape too, not just color (see index.css).
 */
test("the Migrate chip shows amber with a count when it rewrote the config", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cm-content")).toContainText("config:recommended");

  await setEditorContent(page, SEMANTIC_COMMITS_CONFIG);
  await runAndAwaitResult(page);

  const migrateChip = page.locator('.stage-chip[data-stage="migrate"]');
  await expect(migrateChip).toBeVisible();
  await expect(migrateChip.locator(".dot.changed")).toBeVisible();
  await expect(migrateChip.locator(".dot.clean")).toHaveCount(0);
  await expect(migrateChip.locator(".stage-chip-count")).toHaveText("·1");
  await expect(migrateChip).toHaveAttribute("aria-label", /migration applied/i);

  // The rule is documented in the stage's own hover card, not just implied
  // by the color.
  await migrateChip.hover();
  const card = page.locator(".glossary-card");
  await expect(card).toBeVisible({ timeout: 5_000 });
  await expect(card).toContainText(/amber/i);
});

test("the Migrate chip stays green/clean with no count when nothing was migrated", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".cm-content")).toContainText("config:recommended");

  await setEditorContent(page, PACKAGE_RULES_CONFIG);
  await runAndAwaitResult(page);

  const migrateChip = page.locator('.stage-chip[data-stage="migrate"]');
  await expect(migrateChip).toBeVisible();
  await expect(migrateChip.locator(".dot.clean")).toBeVisible();
  await expect(migrateChip.locator(".dot.changed")).toHaveCount(0);
  await expect(migrateChip.locator(".stage-chip-count")).toHaveCount(0);
  await expect(migrateChip).toHaveAttribute("aria-label", /nothing to migrate/i);
});
