import { expect, test } from "@playwright/test";
import { encodeShareFragment, PACKAGE_RULES_CONFIG } from "./fixtures";
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
