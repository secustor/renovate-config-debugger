import { expect, test } from "@playwright/test";
import { FIXED_AUTOMERGE_CONFIG, INVALID_AUTOMERGE_CONFIG } from "./fixtures";
import { runAndAwaitResult, setEditorContent } from "./helpers";

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

  // The validate stage reports an error: a red dot on its chip and an entry in
  // the Errors & warnings panel.
  const errorDot = page.locator(".stage-timeline .dot.error");
  await expect(errorDot.first()).toBeVisible();
  const errorMessages = page.locator(".messages li.error");
  await expect(errorMessages.first()).toBeVisible();
  await expect(errorMessages.first()).toContainText(/automerge/i);

  // Fix the config (→ automerge: true) and re-run.
  await setEditorContent(page, FIXED_AUTOMERGE_CONFIG);
  await runAndAwaitResult(page);

  // The error is gone: no error dot, and the Errors & warnings panel (which
  // renders nothing when there are no messages) is absent.
  await expect(page.locator(".stage-timeline .dot.error")).toHaveCount(0);
  await expect(page.locator(".messages li.error")).toHaveCount(0);
});
