import { expect, test } from "@playwright/test";
import { PACKAGE_RULES_CONFIG, SEMANTIC_COMMITS_CONFIG } from "./fixtures";
import {
  openTab,
  resultsPanel,
  runAndAwaitResult,
  setEditorContent,
  tabButton,
  tabPanel,
} from "./helpers";

/**
 * Roadmap 067 — the run loop without the mouse.
 *
 * `ControlOrMeta` throughout: these run on macOS locally and on Linux in CI,
 * and the binding deliberately accepts either modifier on both.
 */

test("⌘⏎ runs the pipeline from inside the editor, without inserting a blank line", async ({
  page,
}) => {
  await page.goto("/");
  await setEditorContent(page, SEMANTIC_COMMITS_CONFIG);

  const editor = page.locator(".cm-content");
  const linesBefore = await page.locator(".cm-line").count();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+Enter");

  // The run happened…
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  // …and CodeMirror's own `Mod-Enter` (insertBlankLine) did not, which is the
  // regression this binding had to outrank to exist at all.
  expect(await page.locator(".cm-line").count()).toBe(linesBefore);
  await expect(editor).toContainText("semanticCommits");
});

test("⌘⏎ runs the pipeline from outside the editor too", async ({ page }) => {
  await page.goto("/");
  await page.locator(".toolbar select").focus();
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
});

test("the editor does not trap Tab", async ({ page }) => {
  await page.goto("/");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Tab");

  // Focus left the editor entirely — before 067 Tab indented the document and
  // there was no way out with the keyboard at all.
  const insideEditor = await page.evaluate(
    () => document.activeElement?.closest(".cm-editor") !== null,
  );
  expect(insideEditor).toBe(false);
});

test("the config skip link is the first tab stop and lands IN the editor", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");

  const skip = page.locator(".skip-link").first();
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();

  await page.keyboard.press("Enter");

  // The link says "the config editor", so the caret lands in the editor — not
  // on the column, whose first content is the welcome blurb and whose next tab
  // stop was "try an example".
  await expect(page.locator(".cm-content")).toBeFocused();
  // And it does not write the fragment: in this app the hash is where a
  // `#config=` share link lives, and `#config-column` would evict it.
  expect(await page.evaluate(() => location.hash)).toBe("");
});

test("the config skip link scrolls the editor into view from far down the page", async ({
  page,
}) => {
  // A viewport short enough that the post-run page genuinely scrolls — the
  // default one does not, which is how "it lands on the column" managed to look
  // like "it does nothing at all".
  await page.setViewportSize({ width: 900, height: 400 });
  await page.goto("/");
  await runAndAwaitResult(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeGreaterThan(0);

  await page.locator(".skip-link").first().focus();
  await page.keyboard.press("Enter");

  await expect(page.locator(".cm-content")).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const box = document.querySelector(".cm-editor")?.getBoundingClientRect();
        return box ? box.top >= 0 && box.top < window.innerHeight : false;
      }),
    )
    .toBe(true);
});

test("the results skip link lands on the selected tab", async ({ page }) => {
  await page.goto("/");
  await runAndAwaitResult(page);

  // Reachable from the top of the document, where a keyboard user starts.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator(".skip-link").first().focus();
  await page.keyboard.press("Tab");

  const resultsSkip = page.locator(".skip-link").nth(1);
  await expect(resultsSkip).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(tabButton(page, "overview")).toBeFocused();
  expect(await page.evaluate(() => location.hash)).toBe("");
});

test("the results tab strip is one tab stop, driven by the arrows", async ({ page }) => {
  await page.goto("/");
  await runAndAwaitResult(page);

  // Only the selected tab is reachable by Tab.
  await expect(tabButton(page, "overview")).toHaveAttribute("tabindex", "0");
  await expect(tabButton(page, "pipeline")).toHaveAttribute("tabindex", "-1");

  await tabButton(page, "overview").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabButton(page, "pipeline")).toHaveAttribute("aria-selected", "true");
  await expect(tabButton(page, "pipeline")).toBeFocused();
  await expect(tabPanel(page, "pipeline")).toBeVisible();

  // End goes to the last tab rather than scrolling the page (016's Home/End
  // still owns every other context).
  await page.keyboard.press("End");
  await expect(tabButton(page, "problems")).toHaveAttribute("aria-selected", "true");
});

test("Enter in a simulator field simulates", async ({ page }) => {
  await page.goto("/");
  await setEditorContent(page, PACKAGE_RULES_CONFIG);
  await runAndAwaitResult(page);
  await openTab(page, "simulator");

  const packageName = page.locator(".sim-field", { hasText: "packageName" }).locator("input");
  await packageName.fill("react");
  await packageName.press("Enter");

  // The results the Simulate button would have produced, from the same form
  // submit — no second code path.
  await expect(page.locator(".sim-verdict-block")).toBeVisible({ timeout: 30_000 });
});

test("a finished run is announced instead of stealing focus", async ({ page }) => {
  await page.goto("/");
  const fileSelect = page.locator(".toolbar select");
  await fileSelect.focus();
  // Run by SHORTCUT, not by clicking — a click would move focus to the button
  // itself and the assertion below would be about the click, not about the run.
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });

  // Focus stayed exactly where the user left it…
  await expect(fileSelect).toBeFocused();
  // …and the outcome went to the live region instead.
  await expect(page.locator("p.visually-hidden[role='status']")).toContainText("Run finished");
});
