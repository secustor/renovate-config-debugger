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

/** Clicks Run and waits for the pipeline to produce a result (timeline appears,
 *  version badge appears). A hung pipeline fails this wait, not the whole test. */
export async function runAndAwaitResult(page: Page): Promise<void> {
  await runButton(page).click();
  await expect(page.locator(".stage-timeline")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".version-badge")).toBeVisible({ timeout: 30_000 });
}
