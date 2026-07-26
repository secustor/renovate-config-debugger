import { expect, test } from "@playwright/test";
import { encodeShareFragment, MERGE_STEPS_CONFIG, PACKAGE_RULES_CONFIG } from "./fixtures";
import { openTab } from "./helpers";

/**
 * Journey 4 — the packageRules simulator. After a run whose config has a
 * minor/patch-scoped automerge rule for lodash, the "npm dependency" quick-fill
 * describes exactly such an update; simulating it must yield a verdict block
 * with a matched rule count ≥ 1 and a matched rule row carrying its applied
 * diff (automerge → true).
 */
test("simulating a matching dependency shows a verdict with a matched rule and its applied diff", async ({
  page,
}) => {
  const fragment = await encodeShareFragment({ config: PACKAGE_RULES_CONFIG });
  await page.goto(fragment);

  // The run completes and the simulator mounts (it needs a result with rules).
  await openTab(page, "simulator");
  const simulator = page.locator(".card", { hasText: "Update simulator" });
  await expect(simulator).toBeVisible();

  // The "npm dependency" quick-fill (lodash, patch update) both fills the form
  // and auto-runs the simulation.
  await simulator.getByRole("button", { name: "npm dependency" }).click();

  // Verdict block appears with a non-zero matched count.
  const verdict = page.locator(".sim-verdict-block");
  await expect(verdict).toBeVisible({ timeout: 15_000 });
  const jump = verdict.locator(".sim-jump");
  await expect(jump).toContainText(/[1-9]\d* of \d+ rule/);

  // At least one rule row reports a "matched" verdict.
  const matchedRow = page.locator(".sim-rule", {
    has: page.locator(".sim-verdict.verdict-matched"),
  });
  await expect(matchedRow.first()).toBeVisible();

  // Expanding it reveals the applied-diff evidence: automerge → true.
  await matchedRow.first().locator(".sim-rule-head").click();
  const applied = matchedRow.first().locator(".sim-merged");
  await expect(applied).toBeVisible();
  await expect(applied).toContainText("automerge");
  await expect(applied.locator(".sim-merged-after").first()).toContainText("true");
});

/**
 * Roadmap 021 — select-on-focus. Three of nine persona sessions mangled a
 * simulator field the same way: a pre-filled field (here, the "npm
 * dependency" quick-fill's packageName = "lodash") gets focused and typed
 * into, and — without select-on-focus — the new characters land wherever the
 * click placed the caret instead of replacing the old value outright.
 */
test("focusing a pre-filled simulator field selects its content so typing replaces it", async ({
  page,
}) => {
  const fragment = await encodeShareFragment({ config: PACKAGE_RULES_CONFIG });
  await page.goto(fragment);

  await openTab(page, "simulator");
  const simulator = page.locator(".card", { hasText: "Update simulator" });
  await expect(simulator).toBeVisible();

  await simulator.getByRole("button", { name: "npm dependency" }).click();
  const packageNameInput = simulator.getByLabel("packageName", { exact: true });
  await expect(packageNameInput).toHaveValue("lodash");

  // A real click (not `.fill()`, which selects-all itself) — the field must
  // select its own content on focus, so the very first typed character
  // replaces "lodash" rather than inserting into it.
  await packageNameInput.click();
  await packageNameInput.pressSequentially("gradle");
  await expect(packageNameInput).toHaveValue("gradle");
});

/**
 * Roadmap 021 — A/B comparison integrity. Pinning a lodash run as A, then
 * quick-filling and re-simulating a totally different dependency (a GitHub
 * Action) as B, must not present a normal-looking delta — the panel has to
 * flag that A and B describe different simulated inputs.
 */
test("A/B pin warns when the compared runs describe different simulated inputs", async ({
  page,
}) => {
  const fragment = await encodeShareFragment({ config: PACKAGE_RULES_CONFIG });
  await page.goto(fragment);

  await openTab(page, "simulator");
  const simulator = page.locator(".card", { hasText: "Update simulator" });
  await expect(simulator).toBeVisible();

  await simulator.getByRole("button", { name: "npm dependency" }).click();
  await expect(page.locator(".sim-verdict-block")).toBeVisible({ timeout: 15_000 });
  await simulator.getByRole("button", { name: "Pin result for comparison" }).click();

  // A completely different simulated dependency re-runs and becomes B.
  await simulator.getByRole("button", { name: "GitHub Action" }).click();

  const mismatch = page.locator(".sim-compare-mismatch");
  await expect(mismatch).toBeVisible({ timeout: 15_000 });
  await expect(mismatch).toContainText("Inputs differ");
  await expect(mismatch).toContainText("packageName");

  // Both input sets are shown, not just the warning.
  const inputsPanel = page.locator(".sim-compare-inputs");
  await expect(inputsPanel).toContainText("lodash");
  await expect(inputsPanel).toContainText("actions/checkout");
});

/**
 * Roadmap 044/046 — the merge timeline. With two rules matching the same
 * dependency and fighting over `automerge`, the sequence must expose the merges
 * one stop at a time: chips for base → each matching rule → flattening → the
 * final config, with the detail panel walking the same index. The rule that
 * never matched contributes no stop.
 */
test("the merge timeline walks the matching rules one stop at a time", async ({ page }) => {
  const fragment = await encodeShareFragment({ config: MERGE_STEPS_CONFIG });
  await page.goto(fragment);

  await openTab(page, "simulator");
  const simulator = page.locator(".card", { hasText: "Update simulator" });
  await expect(simulator).toBeVisible();

  await simulator.getByRole("button", { name: "npm dependency" }).click();
  await expect(page.locator(".sim-verdict-block")).toBeVisible({ timeout: 15_000 });

  // The sequence lands on its base stop; two matching rules → two rule chips
  // (the non-matching middle rule has none) plus flatten and the final config.
  const stepper = page.locator(".sim-merge-steps");
  await expect(stepper).toBeVisible();
  const counter = stepper.locator(".migration-step-counter");
  await expect(counter).toHaveText("Start");
  const chips = stepper.locator(".stage-chip");
  await expect(chips).toHaveCount(5);

  // Selecting the first rule chip opens its merge.
  await chips.filter({ hasText: "packageRules[0]" }).click();
  await expect(counter).toHaveText("Step 1 of 2");
  const head = stepper.locator(".migration-step-head");
  await expect(head).toContainText("packageRules[0]");
  // Only `addLabels`: this rule's `automerge: false` matches the default the
  // effective config already carried, so it changed nothing — exactly the kind
  // of thing the per-step record is here to make visible.
  await expect(stepper.locator(".migration-explanation")).toContainText("addLabels");

  const diff = stepper.locator(".diff-wrapper");
  const firstDiff = await diff.innerText();
  expect(firstDiff).toContain("from-managers-rule");

  // Stepping forward lands on the LAST rule — the one that wins `automerge` —
  // and the chip row tracks the same selection.
  await stepper.getByRole("button", { name: "Next ›" }).click();
  await expect(counter).toHaveText("Step 2 of 2");
  await expect(head).toContainText("packageRules[2]");
  await expect(chips.filter({ hasText: "packageRules[2]" })).toHaveClass(/selected/);
  await expect(stepper.locator(".migration-explanation")).toContainText("automerge");
  const secondDiff = await diff.innerText();
  expect(secondDiff).not.toBe(firstDiff);
  expect(secondDiff).toContain("from-lodash-rule");

  // The base-diff toggle re-frames the same step against the pre-rules base,
  // so the diff changes again without moving the step.
  await stepper.getByLabel("Diff vs. base config").check();
  await expect(counter).toHaveText("Step 2 of 2");
  const cumulativeDiff = await stepper.locator(".diff-wrapper").innerText();
  expect(cumulativeDiff).not.toBe(secondDiff);
  expect(cumulativeDiff).toContain("from-managers-rule");
  expect(cumulativeDiff).toContain("from-lodash-rule");

  // The terminal stop IS the final config (046) — no separate disclosure.
  await chips.filter({ hasText: "final config" }).click();
  await expect(counter).toHaveText("Result");
  await expect(stepper.locator(".config-view")).toBeVisible();

  // A dependency no rule matches has no merge sequence — the timeline is gone,
  // not an empty frame.
  await simulator.getByRole("button", { name: "Dockerfile image" }).click();
  await expect(page.locator(".sim-verdict-block")).toContainText("0 of 3 rules");
  await expect(stepper).toHaveCount(0);
});
