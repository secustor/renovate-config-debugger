import { expect, test } from "@playwright/test";
import { FIXED_AUTOMERGE_CONFIG, INVALID_AUTOMERGE_CONFIG } from "./fixtures";
import { openTab, runAndAwaitResult, setEditorContent } from "./helpers";

/**
 * Journey 3 — paste → Run → validation error shown → edit config (fix it) →
 * re-run → error gone. Exercises the edit-in-CodeMirror path and the validate
 * stage's error → ok transition.
 */
test("a validation error appears, then clears after the config is fixed", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cm-content")).toContainText("config:recommended");

  // Paste a config whose only problem is a validate-stage type error
  // (`automerge` must be a boolean, not "yes").
  await setEditorContent(page, INVALID_AUTOMERGE_CONFIG);
  await runAndAwaitResult(page);

  // A run with an errored stage lands straight on the Problems tab (028),
  // where the problem's card is already visible. Roadmap 075 (iteration 5):
  // one card per finding, headed by the option it is about.
  const errorMessages = page.locator(".messages li.error");
  await expect(errorMessages.first()).toBeVisible();
  await expect(errorMessages.first()).toContainText(/automerge/i);
  await expect(errorMessages.first().locator(".problem-key")).toHaveText("automerge");
  await expect(errorMessages.first().locator(".problem-docs")).toBeVisible();

  // The validate stage reports the same error as a red glyph on its rail node.
  await openTab(page, "pipeline");
  const errorDot = page.locator(".stage-rail .stage-rail-glyph.error");
  await expect(errorDot.first()).toBeVisible();

  // Fix the config (→ automerge: true) and re-run.
  await setEditorContent(page, FIXED_AUTOMERGE_CONFIG);
  await runAndAwaitResult(page);

  // The error is gone: no error dot, and no problem card left to show.
  await expect(page.locator(".stage-rail .stage-rail-glyph.error")).toHaveCount(0);
  await expect(page.locator(".messages li.error")).toHaveCount(0);
});
