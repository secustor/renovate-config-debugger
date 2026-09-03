import { expect, test } from "@playwright/test";
import {
  AUTHORED_BLOCK_CONFIG,
  encodeShareFragment,
  MERGE_STEPS_CONFIG,
  PACKAGE_RULES_CONFIG,
} from "./fixtures";
import {
  clearStarterPins,
  drawer,
  openSimulator,
  openTab,
  simulateFromLink,
  simulateQuickFill,
  tabButton,
} from "./helpers";

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
  // The run completes, the Tests tab's simulator mounts (it needs a result with
  // rules), and the "npm dependency" quick-fill (lodash, patch update) is run.
  await simulateFromLink(page, PACKAGE_RULES_CONFIG);

  // The verdict block carries a non-zero matched count.
  const verdict = page.locator(".sim-verdict-block");
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

  const simulator = await openSimulator(page);

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
 * Roadmap 080 — the detail view can pin what it is looking at. The A/B pin it
 * replaces kept ONE result around for a side-by-side; a standing test keeps the
 * DESCRIPTOR, re-checked on every run and carried in the share link. The action
 * is the Add-a-test panel's, with the same rules: the effective updateType is
 * baked in, and pinning does not navigate — the list is one "← Back to tests"
 * away, and the analysis the reader was in stays on screen.
 */
test("pinning from the detail view adds a standing test without leaving it", async ({ page }) => {
  await page.goto(await encodeShareFragment({ config: PACKAGE_RULES_CONFIG }));
  // Roadmap 091: this config's own rule seeds a starter pin, and the count
  // below is about the pin this test makes — so the starter goes first.
  await openTab(page, "tests");
  await clearStarterPins(page);

  const simulator = await openSimulator(page);
  await simulateQuickFill(simulator, "GitHub Action");
  await expect(page.locator(".sim-verdict-block")).toBeVisible({ timeout: 15_000 });

  await simulator.getByRole("button", { name: "Pin as a standing test" }).click();

  // The click answers itself where it was made — the pins list is a screen away
  // — and the view does not move: the verdict on screen is still the reader's.
  await expect(simulator.locator(".sim-actions")).toContainText("Pinned ✓");
  await expect(page.locator(".sim-verdict-block")).toBeVisible();
  await expect(simulator.getByLabel("packageName", { exact: true })).toHaveValue(
    "actions/checkout",
  );

  // …and the pin is in the list behind the back link, checked against this run.
  await page.getByRole("button", { name: "← Back to tests" }).click();
  const card = page.locator(".pin-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("actions/checkout");
  await expect(tabButton(page, "tests")).toContainText("1");
});

/**
 * Roadmap 044/046/094 — the merge replay. With two rules matching the same
 * dependency and fighting over `automerge`, the replay must state the whole
 * sequence at once: base → each matching rule → flattening → the final config,
 * every stop naming what it did. The rule that never matched contributes no
 * stop. Roadmap 094 retired the positional stepper that used to walk this
 * sequence (chips, Prev/Next, the per-stop diff); the stops themselves are the
 * surviving surface.
 */
test("the merge replay lists every stop, in merge order", async ({ page }) => {
  const simulator = await simulateFromLink(page, MERGE_STEPS_CONFIG);

  // Roadmap 047: the replay lives in a drawer whose collapsed row already
  // compresses it — `base → 2 merges → flatten ⊘N → final · changed …`.
  const mergeDrawer = drawer(page, "How the final config was built");
  await expect(mergeDrawer).toHaveJSProperty("open", false);
  await expect(mergeDrawer.locator(".drawer-summary")).toContainText("base → 2 merges");
  await expect(mergeDrawer.locator(".drawer-summary")).toContainText("changed");
  await mergeDrawer.getByText("How the final config was built").click();

  // Two matching rules → two rule stops (the non-matching middle rule has none)
  // between the base and the flatten + final-config pair.
  const replay = page.locator(".sim-merge-stops");
  await expect(replay).toBeVisible();
  const stops = replay.locator(".sim-merge-stop");
  await expect(stops).toHaveCount(5);
  await expect(stops.first().locator(".migration-step-counter")).toHaveText("Start");

  // The first rule stop names itself and what it wrote. Only `addLabels`: its
  // `automerge: false` matches the default the effective config already
  // carried, so that key is not claimed here — exactly the kind of thing the
  // per-stop record is here to make visible.
  const first = stops.nth(1);
  await expect(first.locator(".migration-step-counter")).toHaveText("Step 1 of 2");
  await expect(first.locator(".migration-step-head")).toContainText("packageRules[0]");
  await expect(first.locator(".migration-explanation")).toContainText("addLabels");

  // The LAST rule stop is the one that wins `automerge`, and it says so.
  const second = stops.nth(2);
  await expect(second.locator(".migration-step-counter")).toHaveText("Step 2 of 2");
  await expect(second.locator(".migration-step-head")).toContainText("packageRules[2]");
  await expect(second.locator(".migration-explanation")).toContainText("automerge");

  // Flattening is a stop of its own, and the terminal stop IS the final config
  // (046) with its Copy control — no separate disclosure.
  await expect(stops.nth(3).locator(".migration-step-head")).toContainText(
    "Update-type flattening",
  );
  const final = stops.nth(4);
  await expect(final.locator(".migration-step-counter")).toHaveText("Result");
  await expect(final.locator(".config-view")).toBeVisible();
  await expect(final.getByRole("button", { name: "Copy config" })).toBeVisible();

  // A dependency no rule matches has no merge sequence — the replay is gone,
  // not an empty frame. The drawer itself stays OPEN across the re-simulation
  // (047: a re-run must never fold what the user opened).
  await simulateQuickFill(simulator, "Dockerfile image");
  await expect(page.locator(".sim-verdict-block")).toContainText("0 of 3 rules");
  await expect(mergeDrawer).toHaveJSProperty("open", true);
  await expect(replay).toHaveCount(0);
});

/**
 * Roadmap 047/054 — a cross-link opens what it targets. The stop link lives
 * inside a THREAD (054: the ledger row expands into that key's causal story),
 * and it points at a stop inside the collapsed merge drawer — so clicking it
 * must open the drawer AND bring that exact stop into view, not merely scroll
 * to a closed row.
 */
test("a verdict thread's step link opens the merge drawer at the stop it names", async ({
  page,
}) => {
  await simulateFromLink(page, MERGE_STEPS_CONFIG);
  const verdict = page.locator(".sim-verdict-block");

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
  // The stop it named is the second rule stop, and the jump lands on it.
  const stop = page.locator(".sim-merge-stop", { hasText: "Step 2 of 2" });
  await expect(stop.locator(".migration-step-head")).toContainText("packageRules[2]");
  await expect(stop).toBeInViewport();

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
  await simulateFromLink(page, PACKAGE_RULES_CONFIG);
  await expect(page.locator(".sim-consumed-note")).toHaveCount(0);

  // The same patch update against a config carrying `minor: { automerge: true }`
  // explains why that block stayed inert.
  await simulateFromLink(page, AUTHORED_BLOCK_CONFIG);

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
  await expect(page.locator(".sim-merge-stop", { hasText: "After the rules" })).toContainText(
    "Update-type flattening",
  );
});

/**
 * Replay-02 R1: the stale veil alone is invisible in a cropped screenshot —
 * a stale and a fresh card are structurally identical. The card must carry
 * the stale class (which paints the veil + stamp), and the banner must name
 * the RUN's inputs, not the form's, so any capture is self-labelling.
 */
test("stale results are veiled and the banner names the run they belong to", async ({ page }) => {
  const simulator = await simulateFromLink(page, PACKAGE_RULES_CONFIG);

  // Change an input WITHOUT re-running: the run below is now stale.
  await simulator.getByLabel("packageName", { exact: true }).fill("react");

  await expect(page.locator(".sim-results-body")).toHaveClass(/stale/);
  // The banner quotes the run (lodash, from the quick-fill), not the form (react).
  await expect(page.locator(".sim-stale-banner")).toContainText("lodash");
});

/**
 * Replay-02 regression (findings-validity N2): the flatten cross-link used to
 * scroll in the same tick it opened the drawer, so the scroll ran against the
 * closed-drawer document height — from the bottom of the page it clamped into
 * a visual no-op and the drawer opened entirely off-screen. The scroll now
 * waits for the drawer body to mount, so the stop it names must actually enter
 * the viewport, not merely flip `open`.
 */
test("the flatten cross-link brings the merge drawer into view from the bottom of the page", async ({
  page,
}) => {
  await simulateFromLink(page, AUTHORED_BLOCK_CONFIG);

  // Stand where the links live: the bottom of the results, where the clamped
  // same-tick scroll used to have zero slack. Roadmap 075: that is the results
  // PANE's own scroll now — the document does not scroll in the shell — so the
  // test scrolls what the reader would scroll.
  await page.evaluate(() => {
    const pane = document.querySelector(".results-col");
    if (pane) {
      pane.scrollTop = pane.scrollHeight;
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await page
    .locator(".sim-consumed-note")
    .getByRole("button", { name: /see the flatten step/ })
    .click();
  await expect(page.locator(".sim-merge-stop", { hasText: "After the rules" })).toBeInViewport();
});

/**
 * Roadmap 079 — the form's own staging, redesigned. The update is a SENTENCE
 * whose four blanks identify it; `updateType` is a derived chip inside that
 * sentence, not a field; everything else sits in three named groups whose
 * headers count what they hold, so a wrong quick-fill is catchable while
 * closed. The live descriptor beside it says what will actually be matched.
 */
test("the form states the update as a sentence, with counted groups beside a live descriptor", async ({
  page,
}) => {
  const simulator = await simulateFromLink(page, PACKAGE_RULES_CONFIG);

  // The chip that started it is the one the form still agrees with.
  await expect(simulator.locator(".sim-quickfill.active")).toHaveText("npm dependency");

  // The sentence's blanks are exactly packageName / currentValue / newValue /
  // datasource — the four fields that identify an update.
  const sentence = simulator.locator(".sim-sentence");
  await expect(sentence.locator("input")).toHaveCount(4);
  await expect(simulator.getByLabel("datasource", { exact: true })).toHaveValue("npm");
  await expect(simulator.getByLabel("packageName", { exact: true })).toHaveValue("lodash");

  // updateType is stated, not asked — and the version pair it came from is in
  // the chip's title, where 047's one-liner used to spell it out.
  await expect(simulator.locator(".sim-ut-value")).toHaveText("patch");
  const updateType = simulator.getByLabel("updateType", { exact: true });
  await expect(updateType).toHaveValue("patch");
  await expect(updateType).toHaveAttribute("title", /derived from 4\.17\.20 → 4\.17\.21/);
  // Overriding it is the same select, and still drives the simulation.
  await updateType.selectOption("major");
  await expect(simulator.locator(".sim-ut-value")).toHaveText("major");

  // The quick-fill's other writes are counted on the closed group headers.
  const groups = simulator.locator(".sim-group");
  await expect(groups).toHaveCount(3);
  await expect(groups.nth(0)).toContainText("Where it lives in your repo");
  await expect(groups.nth(0).locator(".sim-group-count")).toHaveText("3 set");
  await expect(groups.nth(1).locator(".sim-group-count")).toHaveText("none set");
  await expect(simulator.locator(".sim-group-body")).toHaveCount(0);

  // The live descriptor prints what will actually be matched, derived type
  // included — and omits the keys this form leaves unset.
  const descriptor = simulator.locator(".sim-descriptor-json");
  await expect(descriptor).toContainText('"packageName": "lodash"');
  await expect(descriptor).toContainText('"updateType": "major"');
  await expect(descriptor).not.toContainText('"depType": ""');

  // One group open at a time; it holds `manager` (a registry combobox) and
  // survives a re-run.
  await groups.nth(0).getByRole("button").first().click();
  await expect(simulator.locator(".sim-group-body")).toHaveCount(1);
  const manager = simulator.getByLabel("manager", { exact: true });
  await expect(manager).toHaveValue("npm");
  await expect(manager).toHaveAttribute("list", "sim-manager-names");
  await groups.nth(1).getByRole("button").first().click();
  await expect(groups.nth(0).locator(".sim-group-body")).toHaveCount(0);
  await expect(groups.nth(1).locator(".sim-group-body")).toHaveCount(1);

  // The `updateType` override above left the results stale, so the veil
  // LIFTING is this run's own landing — without waiting for it, the re-assert
  // below resolves against the pre-click page and "survives a re-run" is a
  // claim that cannot fail.
  await expect(page.locator(".sim-results-body")).toHaveClass(/stale/);
  await simulator.getByRole("button", { name: "Simulate" }).click();
  await expect(page.locator(".sim-results-body")).not.toHaveClass(/stale/);
  await expect(groups.nth(1).locator(".sim-group-body")).toHaveCount(1);
});
