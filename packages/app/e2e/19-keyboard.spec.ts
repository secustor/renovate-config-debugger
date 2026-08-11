import { expect, test } from "@playwright/test";
import { PACKAGE_RULES_CONFIG, SEMANTIC_COMMITS_CONFIG } from "./fixtures";
import {
  openSessionMenu,
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

test("the results tab strip is one tab stop, arrows move focus, Enter selects", async ({
  page,
}) => {
  await page.goto("/");
  await runAndAwaitResult(page);

  // Only the selected tab is reachable by Tab.
  await expect(tabButton(page, "overview")).toHaveAttribute("tabindex", "0");
  await expect(tabButton(page, "pipeline")).toHaveAttribute("tabindex", "-1");

  await tabButton(page, "overview").focus();
  await page.keyboard.press("ArrowRight");

  // Manual activation (ARIA APG): looking is not choosing. An arrow moves
  // focus and nothing else — selection-follows-focus made one glance destroy
  // the "← Back to …" trail a cross-link had just left.
  await expect(tabButton(page, "pipeline")).toBeFocused();
  await expect(tabButton(page, "overview")).toHaveAttribute("aria-selected", "true");
  await expect(tabPanel(page, "overview")).toBeVisible();

  // Enter commits — a `<button>`'s own behaviour, so there is no extra binding.
  await page.keyboard.press("Enter");
  await expect(tabButton(page, "pipeline")).toHaveAttribute("aria-selected", "true");
  await expect(tabPanel(page, "pipeline")).toBeVisible();

  // End moves focus to the last tab rather than scrolling the page (016's
  // Home/End still owns every other context), and still does not select.
  await page.keyboard.press("End");
  await expect(tabButton(page, "problems")).toBeFocused();
  await expect(tabButton(page, "pipeline")).toHaveAttribute("aria-selected", "true");
});

test("arrowing across the strip keeps the cross-link back affordance", async ({ page }) => {
  // Default config, like 11-tabbed-shell's chip test — it resolves presets, so
  // the Effective config tab has provenance chips to jump from.
  await page.goto("/");
  await runAndAwaitResult(page);

  // A cross-link jump records where the user came from and offers one click
  // back; merely looking at a neighbouring tab must not throw that away. Same
  // chip 11-tabbed-shell uses to prove the jump itself.
  await openTab(page, "effective");
  const chip = page
    .locator('#panel-effective .badge.prov-layer.prov-preset[role="button"]')
    .first();
  await expect(chip).toBeVisible();
  await chip.click();

  const back = page.locator(".tab-back");
  await expect(back).toBeVisible();

  await page.locator('.tab-bar [role="tab"][aria-selected="true"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(back).toBeVisible();
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

// ── Roadmap 067 tier 1 ───────────────────────────────────────────────────────

test("e and r jump between the panes, and never fire while typing", async ({ page }) => {
  await page.goto("/");
  await runAndAwaitResult(page);

  // From anywhere that is not a text field.
  await tabButton(page, "overview").focus();
  await page.keyboard.press("e");
  await expect(page.locator(".cm-content")).toBeFocused();

  // `e` typed INSIDE the editor is a letter, not a shortcut — the guard that
  // makes a bare-key layer safe at all.
  const before = await page.locator(".cm-content").textContent();
  await page.keyboard.press("e");
  expect(await page.locator(".cm-content").textContent()).not.toBe(before);

  // Tab lands on the file-name `<select>`, where a bare key is deliberately
  // suppressed so it cannot eat the select's own type-ahead…
  await page.keyboard.press("Tab");
  await expect(page.locator(".toolbar select")).toBeFocused();
  await page.keyboard.press("r");
  await expect(page.locator(".toolbar select")).toBeFocused();

  // …but from anywhere that is not a form control, `r` goes to the results.
  await page.locator("h1").click();
  await page.keyboard.press("r");
  await expect(tabButton(page, "overview")).toBeFocused();
});

test("digits jump straight to a results tab, by strip position", async ({ page }) => {
  await page.goto("/");
  await runAndAwaitResult(page);
  await tabButton(page, "overview").focus();

  await page.keyboard.press("2");
  await expect(tabButton(page, "pipeline")).toHaveAttribute("aria-selected", "true");
  await expect(tabPanel(page, "pipeline")).toBeVisible();

  await page.keyboard.press("4");
  await expect(tabButton(page, "presets")).toHaveAttribute("aria-selected", "true");
});

test("⌘⇧⏎ runs and takes you to the results", async ({ page }) => {
  await page.goto("/");
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+Shift+Enter");

  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  // Unlike plain ⌘⏎, this one moves focus — that is the whole difference.
  await expect(tabButton(page, "overview")).toBeFocused();
});

test("? opens the shortcut sheet, listing every global binding", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("?");

  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Run the pipeline");
  await expect(sheet).toContainText("Jump to the config editor");
  await expect(sheet).toContainText("1 – 7");

  // Escape is the dialog's own — the browser closes it, no ladder involved.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

test("the session menu names the key that opens the sheet, and opens it", async ({ page }) => {
  await page.goto("/");
  const panel = await openSessionMenu(page);

  const row = panel.getByRole("button", { name: /Keyboard shortcuts/ });
  // The key is printed on the row the way a native menu prints it…
  await expect(row.locator("kbd")).toHaveText("?");
  // …and stated in words too, since the printed one is aria-hidden.
  await expect(row).toContainText("Press ? any time");

  await row.click();
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
});

test("the file-name picker opens on Enter", async ({ page }) => {
  // The native popup is not in the DOM, so record the call the browser makes.
  await page.addInitScript(() => {
    const marker = window as typeof window & { pickerOpened?: string[] };
    marker.pickerOpened = [];
    HTMLSelectElement.prototype.showPicker = function record(this: HTMLSelectElement) {
      marker.pickerOpened?.push(this.getAttribute("aria-label") ?? "");
    };
  });
  await page.goto("/");

  const opened = () =>
    page.evaluate(() => (window as typeof window & { pickerOpened?: string[] }).pickerOpened);

  await page.locator(".toolbar select").focus();
  await page.keyboard.press("Enter");
  expect(await opened()).toEqual(["Config file name"]);

  // ⌘⏎ from the same control still runs the pipeline rather than opening it.
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  expect(await opened()).toHaveLength(1);
});

// ── Review follow-ups (2026-08-11) ───────────────────────────────────────────

test("the shortcut sheet is modal: ⌘⏎ behind it does not run, Escape closes it", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("?");
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();

  // The sheet's own row advertises ⌘⏎; pressing it while the modal is up must
  // not run the pipeline behind the user's back.
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(resultsPanel(page)).toHaveCount(0);

  // And Escape closes the SHEET rather than being eaten by the page's ladder,
  // whose `preventDefault` used to suppress the dialog's own close request.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

test("closing the sheet with the button hands focus back to where it came from", async ({
  page,
}) => {
  await page.goto("/");
  await runAndAwaitResult(page);
  await tabButton(page, "overview").focus();

  await page.keyboard.press("?");
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();

  // The Escape path gets this from the browser; the Close button unmounts the
  // dialog first, so the component has to restore focus itself.
  await expect(tabButton(page, "overview")).toBeFocused();
});

test("a bare key still works with a filter checkbox focused", async ({ page }) => {
  await page.goto("/");
  await runAndAwaitResult(page);
  await openTab(page, "effective");

  const checkbox = page.locator("#panel-effective input[type='checkbox']").first();
  await checkbox.focus();
  // A checkbox has no cursor and no type-ahead, so it must not count as
  // "typing" and swallow the jump layer.
  await page.keyboard.press("e");
  await expect(page.locator(".cm-content")).toBeFocused();
});

test("Shift+R does not fire the results jump", async ({ page }) => {
  await page.goto("/");
  await runAndAwaitResult(page);
  await page.locator("h1").click();

  await page.keyboard.press("Shift+r");
  await expect(tabButton(page, "overview")).not.toBeFocused();
  await page.keyboard.press("r");
  await expect(tabButton(page, "overview")).toBeFocused();
});
