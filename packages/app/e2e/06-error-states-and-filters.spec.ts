import { expect, test } from "@playwright/test";
import { INVALID_AUTOMERGE_CONFIG, PACKAGE_RULES_CONFIG } from "./fixtures";
import {
  gotoAppAtDefaultConfig,
  openTab,
  runAndAwaitResult,
  setEditorContent,
  simulateFromLink,
} from "./helpers";

/**
 * Roadmap 023 — honest error states. A config with a validate-stage error is
 * still processed and its post-Validate results shown, but a real Renovate run
 * would refuse it — a banner must say so on those results.
 */
test("a validation error adds a hypothetical-run banner to post-Validate results", async ({
  page,
}) => {
  await gotoAppAtDefaultConfig(page);

  await setEditorContent(page, INVALID_AUTOMERGE_CONFIG);
  await runAndAwaitResult(page);

  // The run landed on Problems with a fix-it card for the error…
  await expect(page.locator(".messages li.error").first()).toBeVisible();

  // …the validate stage carries a red glyph on the pipeline rail…
  await openTab(page, "pipeline");
  await expect(page.locator(".stage-rail .stage-rail-glyph.error").first()).toBeVisible();

  // …and the honesty banner is present on the post-Validate results. Roadmap
  // 075: it is stated ONCE, in the shell's run-level banner slot, because it is
  // a fact about the run and not about one instrument — so it is there on
  // whichever tab the reader is on, including the two that never carried it.
  const banner = page.locator(".results-panel .hypothetical-banner");
  await expect(banner).toHaveCount(1);
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/would refuse this config/i);

  await openTab(page, "effective");
  await expect(banner).toBeVisible();
  await openTab(page, "presets");
  await expect(banner).toBeVisible();
});

/**
 * Roadmap 023 — the rules drawer's provenance filter, the successor to the
 * "my rules only" toggle. The most common wish across the persona sessions:
 * find your own rule fast. Narrowing the facet to `repo config` filters the
 * simulator results to the repo config's own packageRules, with clause
 * evidence expanded.
 */
test("the simulator's repo-config filter shows repo rules with clause evidence expanded", async ({
  page,
}) => {
  // A run has to exist before the filter appears (it needs a simulation) —
  // roadmap 080: the chip fills, Simulate runs.
  const simulator = await simulateFromLink(page, PACKAGE_RULES_CONFIG);

  // Roadmap 047: the rule list and its filters live in the "Matched rules"
  // drawer now — the filter is one disclosure away, not gone.
  await simulator.getByText("Matched rules").click();

  const presetFilter = simulator.getByLabel("Filter rules by preset");
  await expect(presetFilter).toBeVisible();
  await presetFilter.selectOption("repo");

  // The repo rule row is shown, pre-expanded, with its clause evidence visible.
  const expandedRow = simulator.locator(".sim-rule.expanded").first();
  await expect(expandedRow).toBeVisible();
  // 054 layer 7: the drawer reads clause evidence through the SAME grid the
  // threads and the evidence card use — one clause renderer, one grammar.
  await expect(expandedRow.locator(".sim-clause-grid .sim-clause-row").first()).toBeVisible();
});
