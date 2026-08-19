import { expect, type Page, test } from "@playwright/test";
import { encodeShareFragment, MERGE_STEPS_CONFIG, PACKAGE_RULES_CONFIG } from "./fixtures";
import { openTab, runAndAwaitResult, setEditorContent, tabButton } from "./helpers";

/**
 * Roadmap 075 (v2, iteration 6) — the Tests tab as pinned dependency tests.
 *
 * A pin is a saved descriptor: the app re-simulates it against the rules after
 * every run, and the card says in one row what those rules do to it. What this
 * suite pins down is the loop that makes the tab worth having — pin once, edit
 * the config, run, and the answer updates itself — plus the two things that
 * must survive it: the pins ride in a share link, and the full simulator is
 * still reachable, pre-filled, for the one dependency a reader wants to dig
 * into.
 */

const PIN_LODASH = { packageName: "lodash", currentValue: "4.17.20", newValue: "4.17.21" };

/** Fills the ghost row's form (the simulator's own) and pins it. */
async function pinLodash(page: Page): Promise<void> {
  await page.locator(".pin-ghost").click();
  const card = page.locator(".pin-new");
  await card.getByRole("button", { name: "npm dependency" }).click();
  await card.getByRole("button", { name: "Pin ⏎" }).click();
  await expect(page.locator(".pin-card")).toHaveCount(1);
}

test("pinning a dependency checks it against the run, and every run after it", async ({ page }) => {
  await page.goto(await encodeShareFragment({ config: PACKAGE_RULES_CONFIG }));
  await openTab(page, "tests");

  // The tab opens on the list, and the list says what it is for.
  const panel = page.locator("#panel-tests");
  await expect(panel).toContainText("re-checked on every run");
  await expect(page.locator(".pin-card")).toHaveCount(0);
  await expect(tabButton(page, "tests")).toContainText("0");

  await pinLodash(page);

  // The outcome, as chips: the config automerges minor/patch lodash updates,
  // and the quick-fill describes exactly such an update.
  const card = page.locator(".pin-card");
  await expect(card).toContainText("lodash");
  await expect(card.locator(".pill-ok")).toContainText("automerge ✓");
  await expect(card.locator(".pill-count")).toContainText("of 1 rules");
  // …and the tab's badge counts the pins.
  await expect(tabButton(page, "tests")).toContainText("1");

  // Expanding names the rule that did it, in the simulator's grammar.
  await card.locator(".pin-head-toggle").click();
  await expect(card).toContainText("✓ 1 matched");
  await expect(card).toContainText("packageRules[0]");

  // Now the edit: a config whose three rules include two this update matches.
  // Nothing asks the pin to re-check — the RUN is the ask, which is the whole
  // promise of the tab.
  await setEditorContent(page, MERGE_STEPS_CONFIG);
  await runAndAwaitResult(page);
  await openTab(page, "tests");
  await expect(page.locator(".pin-card .pill-count")).toContainText("2 of 3 rules");
  // The card was left expanded, and stays expanded across the run — so the
  // rules it names are the NEW run's, with no second click to ask for them.
  await expect(page.locator(".pin-card")).toContainText("✓ 2 matched");

  // Removing it leaves the list — and the badge — empty again.
  await page.getByRole("button", { name: "Remove the pinned test for lodash" }).click();
  await expect(page.locator(".pin-card")).toHaveCount(0);
  await expect(tabButton(page, "tests")).toContainText("0");
});

test("a share link carries the pinned tests, and they are checked on arrival", async ({ page }) => {
  await page.goto(
    await encodeShareFragment({
      config: PACKAGE_RULES_CONFIG,
      view: { tab: "tests" },
      pins: [PIN_LODASH, { packageName: "react", currentValue: "17.0.0", newValue: "18.0.0" }],
    }),
  );
  await openTab(page, "tests");

  const cards = page.locator(".pin-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("lodash");
  await expect(cards.nth(1)).toContainText("react");
  // Checked against the link's own run, without a click: lodash's patch update
  // automerges, react's major update gets nothing from this config.
  await expect(cards.first().locator(".pill-ok")).toContainText("automerge ✓");
  await expect(cards.nth(1).locator(".pill-muted")).toContainText("default behavior");
});

test("a pin opens in the full simulator, pre-filled, and the way back is one click", async ({
  page,
}) => {
  await page.goto(
    await encodeShareFragment({
      config: PACKAGE_RULES_CONFIG,
      view: { tab: "tests" },
      pins: [PIN_LODASH],
    }),
  );
  await openTab(page, "tests");
  const card = page.locator(".pin-card");
  await expect(card).toHaveCount(1);
  await card.locator(".pin-head-toggle").click();
  await card.getByRole("button", { name: "open in simulator →" }).click();

  // The full analysis surface, on this pin's descriptor — and it has already
  // run, because that is what the descriptor channel does (roadmap 018).
  const simulator = page.locator(".card", { hasText: "Update simulator" });
  await expect(simulator).toBeVisible();
  await expect(simulator.getByLabel("packageName", { exact: true })).toHaveValue("lodash");
  await expect(page.locator(".sim-verdict-block")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "← Back to tests" }).click();
  await expect(page.locator(".pin-card")).toHaveCount(1);
});
