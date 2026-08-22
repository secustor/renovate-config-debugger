import { expect, type Locator, type Page } from "@playwright/test";
import type { ResultsTabId } from "../src/data/results-tabs";

/**
 * Replaces the CodeMirror editor's whole content with `text`.
 *
 * CodeMirror's basicSetup auto-closes brackets/quotes, so typing raw JSON
 * character-by-character (`keyboard.type`) corrupts it. `keyboard.insertText`
 * dispatches a single bulk `insertText` input event — a paste-like insertion
 * CodeMirror applies verbatim, no auto-close — while still going through
 * Playwright's real input path (not CDP-synthesized key events, which the
 * persona study found unreliable). Select-all uses a real key press.
 */
export async function setEditorContent(page: Page, text: string): Promise<void> {
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(text);
  // The editor's onChange drives React state; give the doc a beat to settle.
  const firstLine = must(text.trim().split("\n")[0], "the first line of the editor content");
  await expect(editor).toContainText(firstLine.trim());
}

/**
 * Roadmap 041: `typescript/no-non-null-assertion` is an error everywhere, so
 * the conventional test `!` is gone. `must` does the same narrowing but fails
 * with a sentence naming what was missing — a `boundingBox()` that returned
 * null because the element was not visible now says so, instead of throwing an
 * unlabelled TypeError on the next property read.
 */
export function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${what}, got ${value === null ? "null" : "undefined"}`);
  }
  return value;
}

/**
 * The Run button, wherever the shell puts it (label toggles Run ↔ Running…).
 *
 * Roadmap 075: there is exactly one on screen at a time, and it is a different
 * element before and after the first run — the landing's large centered
 * "Run the pipeline", then the editor toolbar's "Run". Both carry `.run-button`
 * for this reason, so a helper does not have to know which screen it is on.
 */
export function runButton(page: Page) {
  return page.locator("button.run-button");
}

/**
 * Waits for a run that has been REQUESTED to finish.
 *
 * Roadmap 068 put a `<kbd>` shortcut hint inside the Run button, so its text is
 * no longer exactly "Run"; what these waits mean is "no longer Running…".
 *
 * But the first version asserted only the absence of that text, and the ninth
 * review round confirmed what two earlier rounds had refuted: an absence is
 * already true BEFORE the run starts, so every assertion sequenced after this
 * helper could resolve against the pre-run page. That is not a hypothetical —
 * `19-keyboard.spec.ts`'s provenance-chip test was passing for exactly that
 * reason, and the behaviour it was meant to pin (a run from inside the results
 * keeps the tab) did not exist yet.
 *
 * So: wait for the button to enter `Running…` first, then leave it. The enter
 * wait is short and non-fatal — a run against a warm engine can finish before
 * Playwright looks, and the `disabled` attribute is the same signal from the
 * other side — but between them they make "the run happened AND finished" the
 * thing this asserts, rather than "no run is visible right now".
 */
export async function expectRunIdle(page: Page): Promise<void> {
  await Promise.race([
    expect(runButton(page))
      .toContainText("Running", { timeout: 2_000 })
      .catch(() => undefined),
    expect(runButton(page))
      .toBeDisabled({ timeout: 2_000 })
      .catch(() => undefined),
  ]);
  await expect(runButton(page)).not.toContainText("Running", { timeout: 30_000 });
  await expect(runButton(page)).toBeEnabled({ timeout: 30_000 });
}

/** Roadmap 028: the tabbed results shell — present only once a run exists. */
export function resultsPanel(page: Page) {
  return page.locator(".results-panel");
}

/** The tab ids of the 028 results shell — the app's own union (roadmap 033:
 *  imported, not hand-copied, so a renamed/added tab breaks these helpers at
 *  compile time instead of silently never matching). */
export type TabId = ResultsTabId;

/** The tab strip button for a tab (visible whether or not it has content). */
export function tabButton(page: Page, id: TabId) {
  return page.locator(`.tab-bar .tab[data-tab="${id}"]`);
}

/** A tab's panel — always mounted, `hidden` unless it is the active tab. */
export function tabPanel(page: Page, id: TabId) {
  return page.locator(`#panel-${id}`);
}

/**
 * Roadmap 028: opens a results tab and waits for its panel to be revealed.
 * Every instrument now lives behind a tab, so reaching one is a click away.
 */
export async function openTab(page: Page, id: TabId): Promise<void> {
  // The shell only exists once a run has produced a result; give a pipeline
  // started by a share link the same headroom a plain Run gets.
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  await tabButton(page, id).click();
  await expect(tabPanel(page, id)).toBeVisible();
}

/**
 * Roadmap 075 (v2, iteration 3): the Rewrites tab folded into Pipeline's
 * migrate stage, so reaching the rewrite stepper (and the migrate diff) is now
 * "open Pipeline, select Migrate". One helper, so every spec that used to say
 * `openTab(page, "rewrites")` still says one thing.
 */
export async function openMigrateStage(page: Page): Promise<void> {
  await openTab(page, "pipeline");
  await page.locator('.stage-rail-btn[data-stage="migrate"]').click();
  // `.first()`: since 075 the migrate stage's panel holds TWO cards — the stage
  // itself, and the rewrite stepper folded in from the retired tab.
  await expect(page.locator("#panel-pipeline .card-title").first()).toContainText("Stage: Migrate");
}

/**
 * Roadmap 076 (design turn 18d): the two 008 merge layers are EDITED on the
 * pipeline stage cards that report on them, so reaching either editor is "open
 * Pipeline, select that stage" — and, as a consequence, a layer cannot be
 * touched at all until a run exists. Every spec that pastes a global or
 * inherited config goes through here, so "where the layers live" is spelled
 * once (exactly as `openMigrateStage` spells the rewrite stepper's home).
 *
 * Returns the stage card's layer textarea, since every caller's next line fills
 * it or asserts on its value.
 */
export async function openLayerStage(page: Page, stage: "global" | "inherit"): Promise<Locator> {
  await openTab(page, "pipeline");
  await page.locator(`.stage-rail-btn[data-stage="${stage}"]`).click();
  const editor = page.locator("#panel-pipeline textarea.layer-editor");
  await expect(editor).toBeVisible();
  return editor;
}

/**
 * Roadmap 075 (v2, iteration 5b): the Presets tab opens on the LEDGER — what
 * `extends` brought in, per source — and the full resolution tree is one click
 * away. Every spec that drives the tree itself goes through here, so "where the
 * tree lives" is spelled once. Cross-links (a provenance chip, a share link's
 * `node`) do NOT need it: naming a node switches the tab to the tree by itself.
 */
export async function openPresetTree(page: Page): Promise<void> {
  await openTab(page, "presets");
  await page
    .locator("#panel-presets")
    .getByRole("button", { name: /open the full tree/ })
    .first()
    .click();
  await expect(page.locator("#panel-presets .preset-row").first()).toBeVisible();
}

/**
 * Roadmap 082: the Effective config's clickable preset chip lives in the
 * CASCADE now — the design's row carries a note in its third cell, not a copy
 * of the layer chip its band header already states. So a spec that drives the
 * chip expands a preset-decided row first, exactly as a reader does.
 *
 * Assumes the tab is open and the presets band has rows (the default config
 * extends `config:recommended`). Returns the chip, since every caller's next
 * line clicks or focuses it.
 */
export async function effectivePresetChip(page: Page): Promise<Locator> {
  const band = page.locator("#panel-effective .prov-section-preset");
  await expect(band.locator(".prov-row-head").first()).toBeVisible();
  await band.locator(".prov-row-head").first().click();
  const chip = page
    .locator('#panel-effective .badge.prov-layer.prov-preset[role="button"]')
    .first();
  await expect(chip).toBeVisible();
  return chip;
}

/**
 * Roadmap 075 (v2, iteration 6): the Tests tab opens on the PINNED TESTS — the
 * descriptors re-checked on every run — and the full simulator (one dependency,
 * every rule, the merge replay) is one quiet link away. Every spec that drives
 * the simulator itself goes through here, so "where the simulator lives" is
 * spelled once, exactly as `openPresetTree` spells the tree's home.
 *
 * A link carrying `sim` does NOT need it: naming a simulation opens the
 * simulator by itself (see `TestsPanel`), which is what the 054 thread-link
 * test relies on.
 *
 * Roadmap 080: every door into the detail view carries a SUBJECT — the strip's
 * descriptor-less "open the simulator →" is gone. So the door a spec uses is
 * the one a user has: simulate a one-off in the Add-a-test box (the "npm
 * dependency" quick-fill) and follow its "open in simulator →". The simulator
 * then arrives with that descriptor filled and run — the same state a pin's own
 * link produces, which the specs immediately overwrite with their own quick-fill
 * anyway.
 *
 * Returns the simulator card, since every caller's next line asks it something.
 */
export async function openSimulator(page: Page): Promise<Locator> {
  await openTab(page, "tests");
  const panel = tabPanel(page, "tests");
  const card = page.locator(".card", { hasText: "Update simulator" });
  if (!(await card.isVisible())) {
    const addCard = panel.locator(".pin-add-card");
    await addCard.getByRole("button", { name: "npm dependency" }).click();
    await addCard.getByRole("button", { name: /^Simulate/ }).click();
    await panel.locator(".pin-oneoff").getByRole("button", { name: "open in simulator →" }).click();
  }
  await expect(card).toBeVisible();
  return card;
}

/**
 * Roadmap 080: in the detail view a quick-fill chip FILLS the form and Simulate
 * runs it — one form, one behavior, the same as the Add-a-test box's chips. The
 * two clicks are spelled once here, since every spec that starts from an example
 * makes them.
 */
export async function simulateQuickFill(simulator: Locator, label: string): Promise<void> {
  await simulator.getByRole("button", { name: label }).click();
  await simulator.getByRole("button", { name: /^Simulate/ }).click();
}

/**
 * Roadmap 047: the results are staged into summary drawers — a `<details>`
 * whose summary row abstracts the body. Addressed by their visible title, the
 * way a user finds them.
 */
export function drawer(page: Page, title: string): Locator {
  return page.locator("details.drawer", { hasText: title });
}

/** Clicks Run and waits for the pipeline to produce a result (the results
 *  shell appears, version badge appears). A hung pipeline fails this wait, not
 *  the whole test. */
export async function runAndAwaitResult(page: Page): Promise<void> {
  await runButton(page).click();
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".version-badge")).toBeVisible({ timeout: 30_000 });
}

/**
 * Roadmap 066: the theme switch and the project links moved behind the
 * header's session menu, so anything that reaches them has to open it first.
 *
 * Idempotent on purpose — the trigger is a toggle, and a helper that blindly
 * clicked would CLOSE a menu a previous step left open. Every caller can just
 * ask for it to be open.
 */
export async function openSessionMenu(page: Page): Promise<Locator> {
  const trigger = page.locator(".session-menu-trigger");
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  const panel = page.locator(".session-menu-panel");
  await expect(panel).toBeVisible();
  return panel;
}

/** The 037 theme segment. It lives inside the 066 menu, so callers open that
 *  first — this is just the locator, so it composes with a plain `await`. */
export function themeSwitch(page: Page): Locator {
  return page.getByRole("radiogroup", { name: "Color theme" });
}
