import { expect, test } from "@playwright/test";
import { encodeShareFragment, PACKAGE_RULES_CONFIG } from "./fixtures";
import { openTab, tabButton } from "./helpers";

/**
 * Roadmap 094 — the Tests tab's second group: pattern tests, a `match*`
 * option's patterns tried against the strings they should and should not
 * match, with Renovate's own matcher. What this pins down: a link carries
 * them and they are evaluated on arrival, the badge counts both groups, and
 * an edit re-evaluates without a Run.
 */

test("a share link carries pattern tests; edits re-evaluate in place", async ({ page }) => {
  await page.goto(
    await encodeShareFragment({
      config: PACKAGE_RULES_CONFIG,
      view: { tab: "tests" },
      pins: [{ packageName: "lodash", currentValue: "4.17.20", newValue: "4.17.21" }],
      patternTests: [
        {
          option: "matchDepNames",
          patterns: ["/^react/", "!react-dom"],
          inputs: [
            { value: "react", expect: true },
            { value: "react-dom", expect: false },
            { value: "@types/react", expect: true },
          ],
        },
      ],
    }),
  );
  await openTab(page, "tests");

  // Both groups count: one pin, one pattern test (the starters yield to a
  // link's pins).
  await expect(tabButton(page, "tests")).toContainText("2");
  const card = page.locator(".pattern-card");
  await expect(card).toHaveCount(1);
  await expect(card.locator(".pattern-option")).toHaveValue("matchDepNames");
  await expect(card.locator(".pin-summary")).toContainText("2 of 3 expected");

  await card.getByRole("button", { name: /Expand the pattern test/ }).click();
  await expect(card.getByText("blocked by !react-dom")).toBeVisible();

  // Loosening the regex so `@types/react` matches too: no Run, the card
  // re-evaluates on the keystroke.
  await card.getByLabel("Pattern 1").fill("/react/");
  await expect(card.locator(".pin-summary")).toContainText("3 of 3 expected");

  // A new pattern test from the ghost row lands open, unpicked.
  await page.getByRole("button", { name: /Test a pattern/ }).click();
  await expect(page.locator(".pattern-card")).toHaveCount(2);
  await expect(page.locator(".pattern-option-unset")).toBeVisible();
  await expect(tabButton(page, "tests")).toContainText("3");
});
