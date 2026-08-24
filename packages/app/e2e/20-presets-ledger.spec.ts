import { expect, test } from "@playwright/test";
import {
  effectivePresetChip,
  openPresetTree,
  openTab,
  runAndAwaitResult,
  setEditorContent,
  tabButton,
} from "./helpers";

/** Two top-level sources: Renovate's own firehose, and a one-preset entry. */
const TWO_SOURCE_CONFIG = `{
  "extends": ["config:recommended", ":dependencyDashboard"]
}
`;

/**
 * Roadmap 075 (v2, iteration 5b) — the Presets LEDGER.
 *
 * The tab used to open on the full resolution tree: 1,100 rows of inventory
 * where the reader had asked "what did my `extends` bring in?". It now opens on
 * a ledger — one card per top-level source, each stating what that source
 * contributed — and the tree is one click away, unchanged.
 *
 * The default config extends `config:recommended`, which ships inside Renovate,
 * so this whole spec runs offline.
 */

test("the Presets tab opens on the ledger, and its numbers are the tab's own", async ({ page }) => {
  await page.goto("/");
  await runAndAwaitResult(page);

  const badge = tabButton(page, "presets").locator(".tab-count");
  await expect(badge).toBeVisible();
  const presets = (await badge.innerText()).trim();

  await openTab(page, "presets");
  const strip = page.locator("#panel-presets .summary-strip").first();
  // The strip is the tab's lead sentence, and it quotes the badge to the digit
  // — both read the one `TreeSummary` the run produced.
  await expect(strip).toContainText("1 source");
  await expect(strip).toContainText(`into ${presets} presets`);
  await expect(strip).toContainText("0 errors");
  // …and nothing of the tree is on screen yet.
  await expect(page.locator("#panel-presets .preset-row")).toHaveCount(0);

  // Every card starts shut — the header alone carries the source, its counts
  // and its docs; the body is detail the reader asks for.
  const card = page.locator("#panel-presets .ledger-card").first();
  const toggle = card.locator(".ledger-head-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toContainText("config:recommended");
  await expect(toggle).toContainText("Renovate built-in");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  // The mosaic names the families the expansion is mostly made of…
  const tiles = card.locator(".ledger-tile");
  await expect.poll(() => tiles.count()).toBeGreaterThan(2);
  await expect(card.locator(".ledger-tile-label", { hasText: "group:monorepos" })).toBeVisible();

  // …and a tile selects the section that lists what it counts.
  await card.locator("button.ledger-tile-options").click();
  await expect(card.locator(".ledger-section.active")).toContainText("Set options");
});

test("an option row's preset token lands on that node in the tree, and back returns", async ({
  page,
}) => {
  await page.goto("/");
  await runAndAwaitResult(page);
  await openTab(page, "presets");

  const card = page.locator("#panel-presets .ledger-card").first();
  // Cards start shut; the option rows are body content, opened from the header.
  await card.locator(".ledger-head-toggle").click();
  const row = card.locator(".ledger-option-row").first();
  await expect(row).toBeVisible();
  const token = row.locator("button.preset-token");
  const preset = (await token.innerText()).trim();

  await token.click();
  // The token is the standard preset cross-link: the tree, selected on the
  // preset that set the option.
  const selected = page.locator("#panel-presets .preset-name.selected");
  await expect(selected).toBeVisible();
  await expect(selected).toHaveText(preset);

  // And the tree view says how to get back to the ledger.
  await page.locator("#panel-presets").getByRole("button", { name: "← Back to summary" }).click();
  await expect(page.locator("#panel-presets .preset-row")).toHaveCount(0);
  await expect(page.locator("#panel-presets .ledger-card").first()).toBeVisible();
});

test("every source card starts shut and opens from its own header", async ({ page }) => {
  await page.goto("/");
  await setEditorContent(page, TWO_SOURCE_CONFIG);
  await runAndAwaitResult(page);
  await openTab(page, "presets");

  const cards = page.locator("#panel-presets .ledger-card");
  await expect(cards).toHaveCount(2);
  // Both closed — no card is promoted over another, whatever their sizes; the
  // headers alone are the list of sources with their counts.
  await expect(cards.nth(0).locator(".ledger-head-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(cards.nth(1).locator(".ledger-head-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );

  // …and each opens from its own header, independently. (Until 082 the strip
  // listed the sources as tokens that scrolled to their cards; the strip is
  // counts only now — the cards below ARE the list of sources.)
  await cards.nth(0).locator(".ledger-head-toggle").click();
  await expect(cards.nth(0).locator(".ledger-head-toggle")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(cards.nth(1).locator(".ledger-head-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("a cross-link into the tab still lands on the tree, never on the ledger", async ({ page }) => {
  await page.goto("/");
  await runAndAwaitResult(page);

  // The provenance chip is the oldest of the three cross-links (005) and the
  // one 11 covers for the tab switch; here it pins the VIEW the switch lands
  // on, which the ledger could have quietly taken over.
  await openTab(page, "effective");
  await (await effectivePresetChip(page)).click();

  await expect(page.locator("#panel-presets .preset-name.selected")).toBeVisible();
  await expect(page.locator("#panel-presets .ledger-card")).toHaveCount(0);
});

test("the ledger's tree stays the tree — the tab's other view is untouched", async ({ page }) => {
  await page.goto("/");
  await runAndAwaitResult(page);
  await openPresetTree(page);

  // The stats strip with its glossary hovers, the search box and the flat
  // table all belong to the tree view and stay there (the ledger's strip is a
  // sentence, not a replacement for them).
  await expect(page.locator("#panel-presets .preset-summary")).toBeVisible();
  await expect(page.locator("#panel-presets .preset-search")).toBeVisible();
});
