import { expect, test } from "@playwright/test";
import { encodeShareFragment, PACKAGE_RULES_CONFIG } from "./fixtures";

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
  await expect(page.locator(".stage-timeline")).toBeVisible({ timeout: 30_000 });
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
