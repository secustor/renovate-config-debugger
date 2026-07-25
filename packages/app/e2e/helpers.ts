import { expect, type Page } from "@playwright/test";

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
  await expect(editor).toContainText(text.trim().split("\n")[0]!.trim());
}

/** The primary Run button in the toolbar (label toggles Run ↔ Running…). */
export function runButton(page: Page) {
  return page.locator(".toolbar button.primary");
}

/** Roadmap 028: the tabbed results shell — present only once a run exists. */
export function resultsPanel(page: Page) {
  return page.locator(".results-panel");
}

/** The tab ids of the 028 results shell (see src/results-tabs.ts). */
export type TabId =
  | "overview"
  | "pipeline"
  | "rewrites"
  | "presets"
  | "effective"
  | "simulator"
  | "problems";

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

/** Clicks Run and waits for the pipeline to produce a result (the results
 *  shell appears, version badge appears). A hung pipeline fails this wait, not
 *  the whole test. */
export async function runAndAwaitResult(page: Page): Promise<void> {
  await runButton(page).click();
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".version-badge")).toBeVisible({ timeout: 30_000 });
}
