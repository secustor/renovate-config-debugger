import { expect, test } from "@playwright/test";
import {
  AUTHORED_BLOCK_CONFIG,
  encodeShareFragment,
  MERGE_STEPS_CONFIG,
  PACKAGE_RULES_CONFIG,
} from "./fixtures";
import { drawer, openTab } from "./helpers";

/**
 * Journey 4 — the packageRules simulator. After a run whose config has a
 * minor/patch-scoped automerge rule for lodash, the "npm dependency" quick-fill
 * describes exactly such an update; simulating it must yield a verdict block
 * with a matched rule count ≥ 1 and a matched rule row carrying its applied
 * diff (automerge → true).
 *
 * Roadmap 047: the rule rows are one disclosure away, and the verdict's own
 * "N of M rules matched →" link is what opens it — a cross-link opens what it
 * targets rather than pointing into a closed drawer.
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
  // Both full-trace links wear `.sim-jump` (one grammar, one rule), so the
  // matched-rules one is addressed by what it says, not by being the only one.
  const jump = verdict.getByRole("button", { name: /\d+ of \d+ rules? matched/ });
  await expect(jump).toContainText(/[1-9]\d* of \d+ rule/);

  // The rules drawer starts collapsed, but its summary row already carries the
  // count — the collapsed state still answers "is it worth opening".
  const rulesDrawer = drawer(page, "Matched rules");
  await expect(rulesDrawer).toHaveJSProperty("open", false);
  await expect(rulesDrawer.locator(".drawer-summary")).toContainText(/[1-9]\d* of \d+ matched/);

  // The verdict's rule-count link opens it.
  await jump.click();
  await expect(rulesDrawer).toHaveJSProperty("open", true);

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

  // Roadmap 047: the timeline lives in a drawer whose collapsed row already
  // compresses it — `base → 2 merges → flatten ⊘N → final · changed …`.
  const mergeDrawer = drawer(page, "How the final config was built");
  await expect(mergeDrawer).toHaveJSProperty("open", false);
  await expect(mergeDrawer.locator(".drawer-summary")).toContainText("base → 2 merges");
  await expect(mergeDrawer.locator(".drawer-summary")).toContainText("changed");
  await mergeDrawer.getByText("How the final config was built").click();

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
  // not an empty frame. The drawer itself stays OPEN across the re-simulation
  // (047: a re-run must never fold what the user opened).
  await simulator.getByRole("button", { name: "Dockerfile image" }).click();
  await expect(page.locator(".sim-verdict-block")).toContainText("0 of 3 rules");
  await expect(mergeDrawer).toHaveJSProperty("open", true);
  await expect(stepper).toHaveCount(0);
});

/**
 * Roadmap 047/053 — a cross-link opens what it targets. The step link now
 * lives inside a THREAD (053: the ledger row expands into that key's causal
 * story), and it points at a stop inside the collapsed merge drawer — so
 * clicking it must open the drawer AND land on that exact stop, not merely
 * scroll to a closed row.
 */
test("a verdict thread's step link opens the merge drawer at the stop it names", async ({
  page,
}) => {
  const fragment = await encodeShareFragment({ config: MERGE_STEPS_CONFIG });
  await page.goto(fragment);

  await openTab(page, "simulator");
  const simulator = page.locator(".card", { hasText: "Update simulator" });
  await simulator.getByRole("button", { name: "npm dependency" }).click();

  const verdict = page.locator(".sim-verdict-block");
  await expect(verdict).toBeVisible({ timeout: 15_000 });

  const mergeDrawer = drawer(page, "How the final config was built");
  await expect(mergeDrawer).toHaveJSProperty("open", false);

  // `automerge` was last set by packageRules[2] — the second (and last) rule
  // stop, so its thread's link reads "step 2 of 2". The thread has to be
  // expanded first: the story is the disclosure, the row is the index.
  const automergeThread = verdict.locator(".sim-thread").filter({ hasText: "automerge" }).first();
  await automergeThread.locator(".sim-thread-head").click();
  const stepLink = automergeThread.locator(".sim-step-link");
  await expect(stepLink).toContainText("step 2 of 2");
  await stepLink.click();

  await expect(mergeDrawer).toHaveJSProperty("open", true);
  const stepper = page.locator(".sim-merge-steps");
  await expect(stepper.locator(".migration-step-counter")).toHaveText("Step 2 of 2");
  await expect(stepper.locator(".stage-chip").filter({ hasText: "packageRules[2]" })).toHaveClass(
    /selected/,
  );

  // Opening one drawer never folds the other.
  const rulesDrawer = drawer(page, "Matched rules");
  await expect(rulesDrawer).toHaveJSProperty("open", false);
  await verdict.getByRole("button", { name: /\d+ of \d+ rules? matched/ }).click();
  await expect(rulesDrawer).toHaveJSProperty("open", true);
  await expect(mergeDrawer).toHaveJSProperty("open", true);
});

/**
 * Roadmap 047 — the consumed-blocks aside only when it earns its place.
 * Renovate's defaults declare all seven update-type blocks on every config, so
 * the 046 always-on aside was furniture; it now renders only when a block the
 * USER authored was consumed without applying, and names that block's own keys.
 */
test("the consumed-blocks aside names an authored block that didn't apply, and stays silent otherwise", async ({
  page,
}) => {
  // Default-only consumption: a patch update against a config with no authored
  // update-type block says nothing on the card.
  await page.goto(await encodeShareFragment({ config: PACKAGE_RULES_CONFIG }));
  await openTab(page, "simulator");
  let simulator = page.locator(".card", { hasText: "Update simulator" });
  await simulator.getByRole("button", { name: "npm dependency" }).click();
  await expect(page.locator(".sim-verdict-block")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".sim-consumed-note")).toHaveCount(0);

  // The same patch update against a config carrying `minor: { automerge: true }`
  // explains why that block stayed inert.
  await page.goto(await encodeShareFragment({ config: AUTHORED_BLOCK_CONFIG }));
  await openTab(page, "simulator");
  simulator = page.locator(".card", { hasText: "Update simulator" });
  await simulator.getByRole("button", { name: "npm dependency" }).click();
  await expect(page.locator(".sim-verdict-block")).toBeVisible({ timeout: 15_000 });

  const consumed = page.locator(".sim-consumed-note");
  await expect(consumed).toHaveCount(1);
  await expect(consumed).toContainText("minor");
  await expect(consumed).toContainText("automerge");
  await expect(consumed).toContainText("patch");

  // Its flatten link is a cross-link too — it opens the merge drawer.
  const mergeDrawer = drawer(page, "How the final config was built");
  await expect(mergeDrawer).toHaveJSProperty("open", false);
  await consumed.getByRole("button", { name: /see the flatten step/ }).click();
  await expect(mergeDrawer).toHaveJSProperty("open", true);
  await expect(page.locator(".sim-merge-steps .migration-step-head")).toContainText(
    "Update-type flattening",
  );
});

/**
 * Roadmap 047 — the form's own staging. Four primary fields; everything else
 * (including `manager` and `sourceUrl`) sits in one drawer whose summary line
 * shows the values it holds, so a wrong quick-fill is catchable while closed.
 * `updateType` is a derived one-liner, not a select, until "override".
 */
test("the form shows four fields, a derived updateType, and a self-describing drawer", async ({
  page,
}) => {
  await page.goto(await encodeShareFragment({ config: PACKAGE_RULES_CONFIG }));
  await openTab(page, "simulator");
  const simulator = page.locator(".card", { hasText: "Update simulator" });
  await expect(simulator).toBeVisible();

  await simulator.getByRole("button", { name: "npm dependency" }).click();
  await expect(page.locator(".sim-verdict-block")).toBeVisible({ timeout: 15_000 });

  // The primary grid is exactly datasource / packageName / currentValue / newValue.
  const primary = simulator.locator(".sim-form").first();
  await expect(primary.locator(".sim-field")).toHaveCount(4);
  await expect(simulator.getByLabel("datasource", { exact: true })).toHaveValue("npm");

  // updateType is stated, not asked — and the version pair it came from is named.
  const derived = simulator.locator(".sim-derived-line");
  await expect(derived).toContainText("updateType: patch");
  await expect(derived).toContainText("4.17.20 → 4.17.21");

  // The quick-fill's other writes are visible on the closed drawer's summary.
  const moreDrawer = drawer(page, "More about this update");
  await expect(moreDrawer).toHaveJSProperty("open", false);
  const summary = moreDrawer.locator(".drawer-summary");
  await expect(summary).toContainText("manager npm");
  await expect(summary).toContainText("packageFile package.json");
  await expect(summary).toContainText("sourceUrl —");

  // "override" reveals the select, which still drives the simulation.
  await derived.getByRole("button", { name: "override" }).click();
  await expect(derived).toHaveCount(0);
  // The only <select> left on the form is the revealed updateType override.
  await expect(simulator.locator("select")).toHaveValue("patch");

  // The drawer holds `manager` (a registry combobox) and survives a re-run.
  await moreDrawer.getByText("More about this update").click();
  await expect(moreDrawer).toHaveJSProperty("open", true);
  const manager = simulator.getByLabel("manager", { exact: true });
  await expect(manager).toHaveValue("npm");
  await expect(manager).toHaveAttribute("list", "sim-manager-names");
  await simulator.getByRole("button", { name: "Simulate" }).click();
  await expect(moreDrawer).toHaveJSProperty("open", true);
});
