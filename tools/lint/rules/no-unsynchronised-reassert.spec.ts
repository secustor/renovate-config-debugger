import { ruleTester } from "../rule-tester.ts";
import rule from "./no-unsynchronised-reassert.ts";

/** Every case is a spec-file body: the shape only exists inside a test. */
function inTest(...lines: string[]): string {
  return `test("t", async ({ page }) => {\n${lines.map((line) => `  ${line}`).join("\n")}\n});`;
}

ruleTester.run("no-unsynchronised-reassert", rule, {
  valid: [
    // ---- the narrowing that keeps real sites out ----------------------------
    // 06-error-states-and-filters.spec.ts:40-43 — `openTab` awaits its own
    // landing, so the assertion after it is meaningful.
    inTest(
      "await expect(banner).toBeVisible();",
      'await openTab(page, "effective");',
      "await expect(banner).toBeVisible();",
      'await openTab(page, "presets");',
      "await expect(banner).toBeVisible();",
    ),
    // 11-tabbed-shell.spec.ts:526-527 — the same shape one file over.
    inTest(
      "await expect(stale).toBeVisible();",
      'await openTab(page, "effective");',
      "await expect(stale).toBeVisible();",
    ),
    // 12-layout-regressions.spec.ts:173-180 — a REAL transition on the same
    // target: count 1, then Escape, then count 0.
    inTest(
      "await toggle.click();",
      'await expect(page.locator(".repo-panel")).toHaveCount(1);',
      'await page.keyboard.press("Escape");',
      'await expect(page.locator(".repo-panel")).toHaveCount(0);',
    ),
    // 12-layout-regressions.spec.ts:206-213 — the model fix: an assertion on the
    // SAME target between the two `toHaveCount(0)`s supersedes the first.
    inTest(
      "await expect(revert).toHaveCount(0);",
      "await setEditorContent(page, PACKAGE_RULES_CONFIG);",
      "await expect(revert).toBeVisible();",
      "await revert.click();",
      "await expect(revert).toHaveCount(0);",
    ),
    // 11-tabbed-shell.spec.ts:536-543 — the fix 335a72ce landed: sync on the
    // revert's own landing before re-asserting the banner.
    inTest(
      "await expect(stale).toBeVisible();",
      "await revert.click();",
      "await expect(revert).toHaveCount(0);",
      'await expect(page.locator(".cm-content")).toContainText("config:recommended");',
      "await expect(stale).toBeVisible();",
    ),
    // ---- the statements that clear the record -------------------------------
    // a `const` between the two (04-simulator.spec.ts:365)
    inTest(
      "await expect(body).toHaveCount(1);",
      "await groups.nth(1).getByRole('button').first().click();",
      'const manager = simulator.getByLabel("manager", { exact: true });',
      "await expect(body).toHaveCount(1);",
    ),
    // a navigation, and an `evaluate` — neither is a raw interaction
    inTest(
      "await expect(panel).toBeVisible();",
      'await page.goto("/");',
      "await expect(panel).toBeVisible();",
    ),
    inTest(
      "await expect(panel).toBeVisible();",
      "await page.evaluate(() => window.scrollTo(0, 0));",
      "await expect(panel).toBeVisible();",
    ),
    // an unawaited assertion is not this rule's assertion shape
    inTest("expect(panel).toBeVisible();", "await panel.click();", "expect(panel).toBeVisible();"),
    // ---- the stated false negatives -----------------------------------------
    // an `expect(…).not.…` chain: the callee's object is a MemberExpression,
    // not the `expect` call.
    inTest(
      "await expect(panel).not.toBeVisible();",
      "await trigger.click();",
      "await expect(panel).not.toBeVisible();",
    ),
    // a multi-argument `expect`
    inTest(
      'await expect(panel, "the popover").toBeVisible();',
      "await trigger.click();",
      'await expect(panel, "the popover").toBeVisible();',
    ),
    // `expect.soft`
    inTest(
      "await expect.soft(panel).toBeVisible();",
      "await trigger.click();",
      "await expect.soft(panel).toBeVisible();",
    ),
    // the target spelled differently the second time
    inTest(
      'await expect(page.locator(".build-info-panel")).toBeVisible();',
      "await trigger.click();",
      "await expect(panel).toBeVisible();",
    ),
    // a computed matcher is not the `expect(x).toX()` shape
    inTest(
      'await expect(panel)["toBeVisible"]();',
      "await trigger.click();",
      'await expect(panel)["toBeVisible"]();',
    ),
    // ---- claims that differ --------------------------------------------------
    // a different matcher on the same target (22-build-info.spec.ts:36-37)
    inTest(
      "await expect(panel).toBeVisible();",
      'await page.locator(".landing-title").click();',
      "await expect(panel).toHaveCount(0);",
    ),
    // the same matcher with different arguments
    inTest(
      'await expect(cmd).toContainText("clone the source");',
      "await tab.click();",
      'await expect(cmd).toContainText("mise run verify-build");',
    ),
    // no interaction at all between the two: a plain duplicate, not this defect
    inTest(
      "await expect(panel).toBeVisible();",
      "await expect(other).toBeVisible();",
      "await expect(panel).toBeVisible();",
    ),
    // ---- the six fixes this rule forced -------------------------------------
    // 22-build-info: the click's own landing is where it puts focus.
    inTest(
      "await expect(panel).toBeVisible();",
      'await panel.locator(".build-info-cmd").click();',
      "await expect(panel).toBeFocused();",
      "await expect(panel).toBeVisible();",
    ),
    // 04-simulator: the stale veil lifting is what says the re-run happened.
    inTest(
      "await expect(groups.nth(1).locator('.sim-group-body')).toHaveCount(1);",
      'await simulator.getByRole("button", { name: "Simulate" }).click();',
      'await expect(page.locator(".sim-results-body")).not.toHaveClass(/stale/);',
      "await expect(groups.nth(1).locator('.sim-group-body')).toHaveCount(1);",
    ),
    // 19-keyboard: a keypress that DOES land, sequenced after the no-op one.
    inTest(
      'await expect(tabButton(page, "problems")).toHaveAttribute("aria-selected", "true");',
      'await page.keyboard.press("Enter");',
      'await page.keyboard.press("e");',
      'await expect(page.locator(".cm-content")).toBeFocused();',
      'await expect(tabButton(page, "problems")).toHaveAttribute("aria-selected", "true");',
    ),
  ],
  invalid: [
    // ---- the historical defect, fixed by hand in 335a72ce -------------------
    // 11-tabbed-shell.spec.ts:538-540 as it stood before that commit: the stale
    // banner is already visible when Revert is clicked.
    {
      code: inTest(
        "await setEditorContent(page, SEMANTIC_COMMITS_CONFIG);",
        "await expect(stale).toBeVisible();",
        'await page.getByRole("button", { name: "Revert to loaded config" }).click();',
        "await expect(stale).toBeVisible();",
      ),
      errors: [{ messageId: "unsynchronisedReassert" }],
    },
    // ---- the six live sites, as they stood ----------------------------------
    // 22-build-info.spec.ts:25, :27, :31 — three in one test body.
    {
      code: inTest(
        'const panel = page.locator(".build-info-panel");',
        "await expect(panel).toBeVisible();",
        'await panel.locator(".build-info-cmd").click();',
        "await expect(panel).toBeVisible();",
        'await panel.locator(".build-info-note").click();',
        "await expect(panel).toBeVisible();",
        'await panel.getByRole("button", { name: "rebuild & diff" }).click();',
        "await expect(panel).toBeVisible();",
        'await expect(panel.locator(".build-info-cmd")).toContainText("clone the source");',
      ),
      errors: [
        { messageId: "unsynchronisedReassert" },
        { messageId: "unsynchronisedReassert" },
        { messageId: "unsynchronisedReassert" },
      ],
    },
    // 04-simulator.spec.ts:372 — "survives a re-run", asserted immediately after
    // the Simulate click.
    {
      code: inTest(
        "await groups.nth(1).getByRole('button').first().click();",
        "await expect(groups.nth(0).locator('.sim-group-body')).toHaveCount(0);",
        "await expect(groups.nth(1).locator('.sim-group-body')).toHaveCount(1);",
        'await simulator.getByRole("button", { name: "Simulate" }).click();',
        "await expect(groups.nth(1).locator('.sim-group-body')).toHaveCount(1);",
      ),
      errors: [{ messageId: "unsynchronisedReassert" }],
    },
    // 19-keyboard.spec.ts:180 — "Enter on the tab already open is a no-op".
    {
      code: inTest(
        'await page.keyboard.press("End");',
        'await expect(tabButton(page, "problems")).toBeFocused();',
        'await expect(tabButton(page, "problems")).toHaveAttribute("aria-selected", "true");',
        'await page.keyboard.press("Enter");',
        'await expect(tabButton(page, "problems")).toHaveAttribute("aria-selected", "true");',
      ),
      errors: [{ messageId: "unsynchronisedReassert" }],
    },
    // 19-keyboard.spec.ts:298 — "a bare key is suppressed on the select".
    {
      code: inTest(
        'await page.locator(".toolbar select").focus();',
        'await expect(page.locator(".toolbar select")).toBeFocused();',
        'await page.keyboard.press("r");',
        'await expect(page.locator(".toolbar select")).toBeFocused();',
      ),
      errors: [{ messageId: "unsynchronisedReassert" }],
    },
    // ---- the other raw interactions -----------------------------------------
    {
      code: inTest(
        'await expect(field).toHaveValue("lodash");',
        'await field.fill("lodash");',
        'await expect(field).toHaveValue("lodash");',
      ),
      errors: [{ messageId: "unsynchronisedReassert" }],
    },
    {
      code: inTest(
        'await expect(select).toHaveValue("npm");',
        'await select.selectOption("npm");',
        'await expect(select).toHaveValue("npm");',
      ),
      errors: [{ messageId: "unsynchronisedReassert" }],
    },
    // two raw interactions in a row still leave the flag set
    {
      code: inTest(
        "await expect(panel).toBeVisible();",
        "await panel.hover();",
        "await panel.click();",
        "await expect(panel).toBeVisible();",
      ),
      errors: [{ messageId: "unsynchronisedReassert" }],
    },
    // a nested block is walked on its own
    {
      code: inTest(
        "if (ready) {",
        "  await expect(panel).toBeVisible();",
        "  await trigger.press('Enter');",
        "  await expect(panel).toBeVisible();",
        "}",
      ),
      errors: [{ messageId: "unsynchronisedReassert" }],
    },
  ],
});
