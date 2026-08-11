import { expect, test } from "@playwright/test";
import { PACKAGE_RULES_CONFIG, SEMANTIC_COMMITS_CONFIG } from "./fixtures";
import {
  expectRunIdle,
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
  //
  // Asserted as two separate facts on purpose. The first version of this test
  // read `activeElement?.closest(".cm-editor") !== null`, which reports TRUE
  // for a null activeElement (`undefined !== null`) — so "focus went nowhere"
  // and "focus is still trapped" were the same answer. That direction happened
  // to fail rather than pass, but a trap test that cannot tell those apart is
  // not saying what it means, and it never checked that focus landed anywhere.
  const focus = await page.evaluate(() => {
    const active = document.activeElement;
    return {
      insideEditor: active instanceof Element && active.closest(".cm-editor") !== null,
      landedSomewhere: active !== null && active !== document.body,
    };
  });
  expect(focus.insideEditor).toBe(false);
  expect(focus.landedSomewhere).toBe(true);
  // And it is the next control in the column, not some arbitrary escape.
  await expect(page.locator(".toolbar select")).toBeFocused();
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

// ── Third-review follow-ups (2026-08-11) ─────────────────────────────────────

test("a second ⌘⏎ after an edit runs against the edited text", async ({ page }) => {
  await page.goto("/");
  await setEditorContent(page, SEMANTIC_COMMITS_CONFIG);
  await runAndAwaitResult(page);

  // Edit, then ask again. The first fix for ⌘⏎ auto-repeat dropped this second
  // request outright, so the results kept describing the pre-edit text.
  await setEditorContent(page, PACKAGE_RULES_CONFIG);
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+Enter");

  await openTab(page, "simulator");
  // The edited config is the only one of the two with packageRules, so the
  // simulator counting one "from your config" is proof the second run happened
  // AND used the new text; the pre-edit config renders the empty state instead.
  await expect(page.locator("#panel-simulator")).toContainText("from your config");
});

test("a bare key is inert under an open menu — Escape comes first", async ({ page }) => {
  await page.goto("/");
  const panel = await openSessionMenu(page);

  // The jump layer is gated on the ladder's top rank: a menu (like a popover)
  // covers the page and holds focus, so `e` must not fly out from under it.
  // Without this, the same press under a portalled rule-evidence card moved the
  // page behind it and left the card explaining a rule no longer on screen.
  await page.keyboard.press("e");
  await expect(panel).toBeVisible();
  await expect(page.locator(".cm-content")).not.toBeFocused();

  // Escape dismisses the menu and hands focus back — and once it has, the jump
  // layer is live again.
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await page.keyboard.press("e");
  await expect(page.locator(".cm-content")).toBeFocused();
});

test("? still opens the sheet from inside the menu that advertises it", async ({ page }) => {
  await page.goto("/");
  const panel = await openSessionMenu(page);
  await expect(panel).toContainText("Press ? any time");

  // The overlay gate is right for the jump keys, which would move the page out
  // from under the menu — but help is what someone stuck under one wants, and
  // the row above promises it works here.
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
});

// ── Fourth-review follow-ups (2026-08-11) ────────────────────────────────────

// NOTE: "a jump only takes focus the jump itself displaced" (the editor preset
// hover card must not steal the caret) has no e2e here on purpose — the jump
// lives in a CodeMirror hover tooltip the page hit-tests over, so Playwright
// cannot click it without a force that defeats what the test would prove. The
// rule lives in App.tsx's `jumpDisplacedFocus`, which is module-private and has
// no unit seam either, so this path is currently guarded by review only.

test("⌘⇧⏎ stands down if you go back to typing while the run resolves", async ({ page }) => {
  await page.goto("/");
  await setEditorContent(page, SEMANTIC_COMMITS_CONFIG);

  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  // Typing is the signal that the user went back to editing — the caret never
  // moves, so no focus comparison could see this.
  await page.keyboard.type(" ");

  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  // The chord's landing was abandoned: focus stayed where the work is.
  await expect(editor).toBeFocused();
});

// ── Fifth-review follow-ups (2026-08-11) ─────────────────────────────────────

test("⌘⏎ still runs from a simulator combobox", async ({ page }) => {
  await page.goto("/");
  await setEditorContent(page, PACKAGE_RULES_CONFIG);
  await runAndAwaitResult(page);
  await openTab(page, "simulator");

  // These two fields decline PLAIN Enter so accepting a datalist suggestion
  // does not also simulate — but the guard once preventDefaulted the modified
  // chord too, and `useShortcut` bails on `defaultPrevented`, so the app's
  // primary shortcut was silently dead in the fields users type in most.
  const datasource = page.locator(".sim-field", { hasText: "datasource" }).locator("input");
  await datasource.click();
  await datasource.fill("npm");
  await page.keyboard.press("ControlOrMeta+Enter");

  await expect(page.locator("p.visually-hidden[role='status']")).toContainText("Run finished");
});

test("⌘⏎ on a focused provenance chip runs, rather than jumping", async ({ page }) => {
  await page.goto("/");
  await runAndAwaitResult(page);
  await openTab(page, "effective");

  const chip = page
    .locator('#panel-effective .badge.prov-layer.prov-preset[role="button"]')
    .first();
  await expect(chip).toBeVisible();
  await chip.focus();

  // The chip implements its own Enter/Space activation, so without a modifier
  // guard ⌘⏎ jumped to the Presets tree — a wrong action, not a dropped one.
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(tabButton(page, "effective")).toHaveAttribute("aria-selected", "true");

  // Re-checked AFTER the run commits. Until the seventh review, `executeRun`
  // reset the tab for every run without `keepTab`, so this assertion passed
  // only because it resolved first — it would have flaked on a fast run and
  // proved nothing on a slow one. A ⌘⏎ pressed from inside the results now
  // keeps the panel the reader was in, and this is where that is asserted.
  await expectRunIdle(page);
  await expect(tabButton(page, "effective")).toHaveAttribute("aria-selected", "true");
  await expect(tabPanel(page, "effective")).toBeVisible();
});

// ── Sixth-review follow-ups (2026-08-11) ─────────────────────────────────────

test("Escape in a combobox reaches the page's own layer on the second press", async ({ page }) => {
  await page.goto("/");
  await runAndAwaitResult(page);
  await openTab(page, "simulator");

  // A native <datalist> popup cannot be detected — no node, no event — so the
  // field gets the FIRST Escape (which may be dismissing suggestions) and the
  // page's ladder gets the next. Before this, the two combobox fields made
  // Escape permanently inert for anything below popover rank.
  const datasource = page.locator(".sim-field", { hasText: "datasource" }).locator("input");
  await datasource.click();
  await datasource.fill("np");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  // Still focused and still usable — the presses went to the field and the
  // ladder, not into a void.
  await expect(datasource).toBeFocused();
});

test("a refused run says so, every time it is refused", async ({ page }) => {
  await page.goto("/");
  // Break the global-config layer so the run is refused before it starts.
  // The layers live behind nested <details> disclosures, not buttons: the
  // Advanced zone first, then the Global config layer inside it.
  await page.locator("summary", { hasText: "Advanced options" }).click();
  await page.locator("summary", { hasText: "Global config" }).click();
  const globalConfig = page.locator("textarea").first();
  await globalConfig.fill("{ not json");

  const live = page.locator("p.visually-hidden[role='status']");
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(live).toContainText("Run blocked");

  // The second press against the same unfixed error must speak too: the alert
  // banner only announces when its TEXT changes, and ⌘⏎ deliberately does not
  // move focus, so this is the only feedback a keyboard user gets.
  await live.evaluate((el) => {
    el.textContent = "";
  });
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(live).toContainText("Run blocked");
});

// ── Eighth-review follow-ups (2026-08-11) ────────────────────────────────────

test("a run requested from inside the results keeps the panel being read", async ({ page }) => {
  await page.goto("/");
  await runAndAwaitResult(page);
  await openTab(page, "effective");
  await page.locator("#panel-effective").getByRole("button").first().focus();

  await page.keyboard.press("ControlOrMeta+Enter");
  await expectRunIdle(page);
  // `gestureWantsResultsLanding()` asks whether the gesture came from the
  // CONFIG COLUMN, so anything else — including the results' own overlays,
  // which are portalled to <body> and used to read as "outside" — keeps the tab.
  await expect(tabButton(page, "effective")).toHaveAttribute("aria-selected", "true");
});

test("a run requested from the config column still lands on the Overview", async ({ page }) => {
  await page.goto("/");
  await runAndAwaitResult(page);
  await openTab(page, "presets");

  // The other half of the same rule — inverting the test must not cost 028's
  // "a run lands on the short Overview" for the reader who edited and ran.
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+Enter");
  await expectRunIdle(page);
  await expect(tabButton(page, "overview")).toHaveAttribute("aria-selected", "true");
});

test("every deliberate ⌘⏎ runs, and the last one describes the editor", async ({ page }) => {
  await page.goto("/");
  await setEditorContent(page, SEMANTIC_COMMITS_CONFIG);
  await runAndAwaitResult(page);

  // The duplicate-fold (added and deleted across two rounds) could answer a
  // restored-config request with an in-flight run for the same text while a
  // DIFFERENT config was queued behind it, leaving the editor and the results
  // describing different things. Asserted as the invariant rather than the
  // timing: once the queue drains, the results describe what the editor holds.
  await setEditorContent(page, PACKAGE_RULES_CONFIG);
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+Enter");
  await setEditorContent(page, SEMANTIC_COMMITS_CONFIG);
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+Enter");

  await expectRunIdle(page);
  await openTab(page, "simulator");
  // SEMANTIC_COMMITS_CONFIG has no packageRules, so the empty state is proof
  // the last run used the editor's current text.
  await expect(page.locator("#panel-simulator")).not.toContainText("from your config");
});
