import { expect, test, type Locator, type Page } from "@playwright/test";
import { INVALID_RULES_CONFIG, PACKAGE_RULES_CONFIG, SEMANTIC_COMMITS_CONFIG } from "./fixtures";
import {
  must,
  openLayerStage,
  openMigrateStage,
  tabButton,
  openPresetTree,
  openSimulator,
  openTab,
  runAndAwaitResult,
  runButton,
  setEditorContent,
} from "./helpers";

/**
 * Roadmap 035 — the layout regressions a 2026-07-25 user review found in the
 * post-028 two-pane shell. Each test below pins one of them; they are geometry
 * and contrast assertions rather than copy assertions, because every one of
 * these bugs was invisible to the existing suite (the DOM was correct
 * throughout — only its rendered size, order or color was wrong).
 */

/** The WCAG 2.1 per-channel linearization an 8-bit sRGB value goes through. */
function channel(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** sRGB relative luminance per WCAG 2.1, from an `rgb()`/`rgba()` string. */
function luminanceOf(css: string): number {
  const [r = 0, g = 0, b = 0] = css
    .replace(/^rgba?\(|\)$/g, "")
    .split(/[\s,/]+/)
    .slice(0, 3)
    .map(Number);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Vertical midpoint of a Playwright bounding box. */
function centerOf(box: { y: number; height: number }): number {
  return box.y + box.height / 2;
}

function contrastRatio(fg: string, bg: string): number {
  const a = luminanceOf(fg);
  const b = luminanceOf(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * The element's own text color and the background actually painted behind it —
 * `background-color` is `rgba(0, 0, 0, 0)` on anything that doesn't paint one,
 * so an unstyled cell has to report its nearest painting ancestor instead.
 */
async function resolvedColors(cell: Locator): Promise<{ color: string; background: string }> {
  return cell.evaluate((el) => {
    const color = getComputedStyle(el).color;
    let node: Element | null = el;
    while (node) {
      const bg = getComputedStyle(node).backgroundColor;
      const alpha = /rgba?\([^)]*[,/]\s*([\d.]+)\s*\)$/.exec(bg);
      if (bg && bg !== "transparent" && (!alpha || Number(alpha[1]) > 0)) {
        return { color, background: bg };
      }
      node = node.parentElement;
    }
    return { color, background: "rgb(255, 255, 255)" };
  });
}

test.describe("dark mode", () => {
  test.use({ colorScheme: "dark" });

  /**
   * Roadmap 031 moved react-diff-view's stylesheet into the lazy results
   * chunk, which loads AFTER the entry CSS — inverting the order that the old
   * equal-specificity dark overrides silently depended on, so diff text went
   * near-white on the library's light backgrounds. The fix scopes CSS custom
   * properties on `.diff-wrapper`, which wins regardless of load order; this
   * assertion is what makes that order-independence testable.
   */
  test("diff text keeps readable contrast against its row background", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".cm-content")).toContainText("config:recommended");

    // A config with exactly one migration — the smallest real diff the app
    // renders (crib from 07-stage-chip-outcomes).
    await setEditorContent(page, SEMANTIC_COMMITS_CONFIG);
    await runAndAwaitResult(page);
    await openMigrateStage(page);

    for (const kind of ["delete", "insert"] as const) {
      const cell = page.locator(`#panel-pipeline .diff-code-${kind}`).first();
      await expect(cell).toBeVisible();
      const { color, background } = await resolvedColors(cell);
      const ratio = contrastRatio(color, background);
      expect(
        ratio,
        `diff-code-${kind}: ${color} on ${background} is only ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

/**
 * The repo-load form was one wrapping flex row whose natural width exceeded
 * the post-run left column, so the Load button always wrapped onto a line of
 * its own. Roadmap 039 moved the form inside the editor card, behind a
 * disclosure in its title bar; roadmap 075 made it an OVERLAY over the editor's
 * document — a chrome row would push the document it is about to replace out of
 * a pane that no longer grows. The 035 no-orphan-row rule is unchanged, and so
 * is what the panel is about: it covers the document, and nothing else.
 */
test("the repo-load panel keeps Load on its inputs' row inside the editor card", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".cm-content")).toContainText("config:recommended");
  // Two-pane mode: the left column is at its narrowest, which is where the
  // button used to break away.
  await runAndAwaitResult(page);
  await expect(page.locator(".app-split.has-results")).toBeVisible();

  await page.getByRole("button", { name: "Load from repo…" }).click();
  const panel = page.locator(".repo-panel");
  await expect(panel).toBeVisible();

  const button = must(
    await panel.getByRole("button", { name: "Load", exact: true }).boundingBox(),
    "the Load button's bounding box",
  );
  const branch = must(
    await panel.getByRole("textbox", { name: "Branch or tag" }).boundingBox(),
    "the Branch field's bounding box",
  );
  const repo = must(
    await panel.getByRole("textbox", { name: "Repository", exact: true }).boundingBox(),
    "the Repository field's bounding box",
  );

  expect(Math.abs(centerOf(button) - centerOf(branch))).toBeLessThanOrEqual(2);
  expect(Math.abs(centerOf(button) - centerOf(repo))).toBeLessThanOrEqual(2);
  // Nothing overflows the column either — the row shrinks its inputs instead.
  const panelBox = must(await panel.boundingBox(), "the repo panel's bounding box");
  expect(button.x + button.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 1);

  // It is a layer OVER the document: below the toolbar strip (which stays
  // usable — its Run says why it is refusing rather than disappearing) and
  // inside the editor's own box.
  const title = must(
    await page.locator(".config-col .editor-card-title").boundingBox(),
    "the editor card title's bounding box",
  );
  const editor = must(
    await page.locator(".config-col .cm-editor").boundingBox(),
    "the CodeMirror editor's bounding box",
  );
  expect(panelBox.y).toBeGreaterThanOrEqual(title.y + title.height - 1);
  expect(panelBox.y).toBeGreaterThanOrEqual(editor.y - 1);
  expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(editor.y + editor.height + 1);
  await expect(page.locator(".repo-overlay-scrim")).toBeVisible();
  // Roadmap 075's disabled-primary rule: a run would act on a document the
  // user is halfway through replacing.
  await expect(runButton(page)).toBeDisabled();

  // The scrim is the third way out, beside Cancel and Escape.
  await page.locator(".repo-overlay-scrim").click();
  await expect(page.locator(".repo-panel")).toHaveCount(0);
  await expect(runButton(page)).toBeEnabled();
});

/**
 * Roadmap 039 — the whole point of the disclosure: it costs nothing until
 * asked for. Nothing of the form may be in the document before the button in
 * the editor card's title bar is pressed, and closing it must leave no orphan
 * row behind (035).
 */
test("the repo-load form is collapsed by default and leaves no row behind", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cm-content")).toContainText("config:recommended");

  const toggle = page.getByRole("button", { name: "Load from repo…" });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".repo-panel")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Repository", exact: true })).toHaveCount(0);

  await toggle.click();
  await expect(page.locator(".repo-panel")).toHaveCount(1);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  // Roadmap 023: opening lands the caret in the first field.
  await expect(page.getByRole("textbox", { name: "Repository", exact: true })).toBeFocused();

  // Escape closes it, and focus comes back to the button that opened it.
  await page.keyboard.press("Escape");
  await expect(page.locator(".repo-panel")).toHaveCount(0);
  await expect(toggle).toBeFocused();

  // The card is whole again: its title bar sits directly on the editor.
  const title = must(
    await page.locator(".config-col .editor-card-title").boundingBox(),
    "the editor card title's bounding box",
  );
  const editor = must(
    await page.locator(".config-col .cm-editor").boundingBox(),
    "the CodeMirror editor's bounding box",
  );
  expect(editor.y - (title.y + title.height)).toBeLessThanOrEqual(1);
});

/**
 * "Revert to loaded config" used to render permanently, `disabled` but styled
 * exactly like an enabled button — an offer that did nothing. It is now
 * present only when there is an edit to discard.
 */
test("Revert to loaded config appears only while the config has unsaved edits", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".cm-content")).toContainText("config:recommended");

  const revert = page.getByRole("button", { name: "Revert to loaded config" });
  await expect(revert).toHaveCount(0);

  await setEditorContent(page, PACKAGE_RULES_CONFIG);
  await expect(revert).toBeVisible();

  await revert.click();
  await expect(revert).toHaveCount(0);
  await expect(page.locator(".cm-content")).toContainText("config:recommended");
});

/**
 * Design review: a pasted config arrives on one line and there was no way to
 * make it readable. Format re-indents in place — and it is an EDIT, not a
 * load, so the revert baseline must stay where it was (that distinction is
 * exactly what "Revert to loaded config" above means).
 *
 * Roadmap 075 (the landing transition) moved Format into the SHELL's title bar
 * — before the first run there is nothing to reformat that the reader has
 * looked at — so the whole exercise now happens after a run.
 */
test("Format re-indents in place and leaves the revert baseline alone", async ({ page }) => {
  await page.goto("/");
  const editor = page.locator(".cm-content");
  await expect(editor).toContainText("config:recommended");
  await runAndAwaitResult(page);

  const format = page.getByRole("button", { name: "Format", exact: true });
  const revert = page.getByRole("button", { name: "Revert to loaded config" });
  await setEditorContent(page, '{"extends":["config:recommended"],"automerge":true}');
  expect(await editor.locator(".cm-line").count()).toBe(1);

  // Position stability: the conditional Revert sits AFTER Format in the shell's
  // title bar. Formatting is an edit that summons Revert — were it the other
  // way around, the button under the cursor would jump sideways the moment it
  // was clicked. "After" is read as reading order, since the bar is free to
  // wrap in a narrow config pane.
  const formatBox = must(await format.boundingBox(), "Format button box");
  const revertBox = must(await revert.boundingBox(), "Revert button box");
  const revertFollows =
    revertBox.y > formatBox.y + formatBox.height / 2 || revertBox.x > formatBox.x;
  expect(revertFollows).toBe(true);

  await format.click();
  await expect(editor).toContainText('"automerge": true');
  expect(await editor.locator(".cm-line").count()).toBeGreaterThan(1);

  // The baseline is still the DEFAULT config the page opened with: one revert
  // undoes the paste and the formatting together.
  await revert.click();
  await expect(editor).not.toContainText("automerge");

  // A document that cannot be parsed says so instead of doing nothing.
  await setEditorContent(page, "{ nope");
  await format.click();
  await expect(page.locator(".app-notice")).toContainText("fix the JSON syntax first");
});

/**
 * Roadmap 075 (the landing transition): the editor's title bar has two shapes.
 * Before the first run it names the DOCUMENT and nothing else — Format
 * re-indents a config nobody has read yet, and Run is already the landing's
 * one large primary. Both arrive with the result. Share (roadmap 077) is the
 * header's, and it too exists only once there is a view worth a link.
 */
test("the title bar carries only the document on the landing, the actions in the shell", async ({
  page,
}) => {
  await page.goto("/");
  const bar = page.locator(".toolbar");
  const format = bar.getByRole("button", { name: "Format", exact: true });
  const share = page.locator(".app-header").getByRole("button", { name: "Share" });

  await expect(bar.getByRole("button", { name: "Load from repo…" })).toBeVisible();
  // The document's own copy is landing-safe — it acts on the text, not a run.
  await expect(bar.getByRole("button", { name: "Copy renovate.json" })).toBeVisible();
  await expect(format).toHaveCount(0);
  await expect(share).toHaveCount(0);
  await expect(bar.locator("button.run-button")).toHaveCount(0);

  await runAndAwaitResult(page);

  await expect(format).toBeVisible();
  await expect(share).toBeVisible();
  await expect(bar.locator("button.run-button")).toBeVisible();
});

/**
 * Design review: the config column is a handful of rows while the results
 * beside it run to thousands of lines, so scrolling the results scrolled the
 * editor — the thing being explained — off the top of the page.
 *
 * Roadmap 075 answers it with the frame rather than with `position: sticky`:
 * the page does not scroll at all, and each pane scrolls itself. The contract
 * this test pins is the same one — scrolling the results never moves the editor
 * — restated for panes: the results pane really does scroll, the document does
 * not, and the editor's box is exactly where it was.
 */
test("the config column stays in view while long results scroll", async ({ page }) => {
  // Wide enough for the split, short enough that the results outrun their pane:
  // every long panel caps itself against the viewport, so a tall window has
  // nothing to scroll at all.
  await page.setViewportSize({ width: 1400, height: 620 });
  await page.goto("/");
  await expect(page.locator(".cm-content")).toContainText("config:recommended");
  await runAndAwaitResult(page);
  await openTab(page, "pipeline");

  const editor = page.locator(".config-col .cm-editor");
  const before = must(await editor.boundingBox(), "the editor's box before scrolling");
  const scrolled = await page.evaluate(() => {
    const pane = document.querySelector(".results-col");
    if (!pane) {
      throw new Error("expected .results-col to be present");
    }
    pane.scrollTop = pane.scrollHeight;
    return { pane: pane.scrollTop, page: window.scrollY };
  });
  // The whole point is a pane long enough to have scrolled the editor away
  // back when the two shared the page's scroll.
  expect(scrolled.pane, "the results pane was not tall enough to scroll").toBeGreaterThan(200);
  // …and the document itself never moved, because it cannot.
  expect(scrolled.page).toBe(0);

  // Still on screen at the bottom of the results — the whole point.
  await expect(editor).toBeInViewport();
  const after = must(await editor.boundingBox(), "the editor's box after scrolling");
  expect(after.y).toBeGreaterThanOrEqual(0);
  // It did not move at all: the pane it lives in is not the pane that scrolled.
  expect(Math.abs(before.y - after.y)).toBeLessThan(1);
});

/** Selects the first preset in the tree and returns its detail panel. */
async function openFirstPresetDetail(page: Page): Promise<Locator> {
  await openPresetTree(page);
  await page.locator("#panel-presets .preset-row .preset-name").first().click();
  const panel = page.locator("#panel-presets .preset-panel");
  await expect(panel).toBeVisible();
  return panel;
}

interface PanelMetrics {
  clientWidth: number;
  scrollWidth: number;
  /** Track count of the split grid — 1 means the container query stacked it. */
  tracks: number;
}

function panelMetrics(panel: Locator): Promise<PanelMetrics> {
  return panel.evaluate((el) => {
    const layout = el.closest(".preset-tree-layout");
    if (!layout) {
      throw new Error("expected an ancestor .preset-tree-layout to be present");
    }
    return {
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      tracks: getComputedStyle(layout).gridTemplateColumns.trim().split(/\s+/).length,
    };
  });
}

/** Both halves of the invariant: nothing clipped horizontally, and the pane is
 *  either wide enough to read a diff in or has stacked to the full card width. */
function expectPanelUsable(metrics: PanelMetrics): void {
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(
    metrics.clientWidth >= 380 || metrics.tracks === 1,
    `panel is ${metrics.clientWidth}px wide across ${metrics.tracks} column(s)`,
  ).toBe(true);
}

/**
 * The tree/detail split stacked only at a 60rem VIEWPORT — a threshold tuned
 * before 028 put this card inside the results column, where the pane is a
 * fraction of the viewport and the query never fired. It now answers to its
 * own width via a container query.
 */
test("the preset detail panel is readable, unclipped and scrollable to its last section", async ({
  page,
}) => {
  await page.goto("/");
  await runAndAwaitResult(page);
  const panel = await openFirstPresetDetail(page);

  expectPanelUsable(await panelMetrics(panel));
  // The same has to hold at a wider viewport, where the container is wide
  // enough that the split could legitimately choose either arrangement.
  await page.setViewportSize({ width: 1700, height: 900 });
  expectPanelUsable(await panelMetrics(panel));
  await page.setViewportSize({ width: 1280, height: 720 });

  // Stacked, the panel opens below the tree — it must still start within one
  // screen of the card's top, or clicking a preset row appears to do nothing.
  const [cardBoxRaw, openedAtRaw] = await Promise.all([
    page.locator("#panel-presets .card").first().boundingBox(),
    panel.boundingBox(),
  ]);
  const cardBox = must(cardBoxRaw, "the preset card's bounding box");
  const openedAt = must(openedAtRaw, "the opened preset detail panel's bounding box");
  expect(openedAt.y - cardBox.y).toBeLessThan(720);

  // The panel's own last section can be reached — it is not clipped off the
  // bottom of a fixed-height box.
  const last = panel.locator("summary", { hasText: "Contribution to the merged config" });
  await expect(last).toHaveCount(1);
  await last.scrollIntoViewIfNeeded();
  const [lastBoxRaw, panelBoxRaw] = await Promise.all([last.boundingBox(), panel.boundingBox()]);
  const lastBox = must(lastBoxRaw, "the last preset detail section's bounding box");
  const panelBox = must(panelBoxRaw, "the preset detail panel's bounding box");
  expect(lastBox.y).toBeGreaterThanOrEqual(panelBox.y - 1);
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height + 1);
});

/**
 * Replay-02 R1: the hypothetical banner disappearing after an applied fix
 * used to move the Simulate button mid-flow — clicks landed on whatever
 * shifted under the pointer. Once shown, the banner's box stays reserved for
 * the session, so the button must not move when validation clears.
 */
test("the simulate button holds its position when the validation banner clears", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".cm-content")).toContainText("config:recommended");
  await setEditorContent(page, INVALID_RULES_CONFIG);
  await runAndAwaitResult(page);

  await openSimulator(page);
  const panel = page.locator("#panel-tests");
  // Roadmap 075: the banner is the shell's run-level one now — same guarantee,
  // one level up, and the reserved box moved with it.
  const banner = page.locator(".results-panel .hypothetical-banner");
  await expect(banner).toBeVisible();
  // Substring name, not `exact`: since 079 the button's accessible name is
  // "Simulate ⏎" (the kbd is part of it), which an exact "Simulate" misses.
  const simulate = panel.getByRole("button", { name: "Simulate" });
  const before = must(await simulate.boundingBox(), "the simulate button's bounding box");

  await setEditorContent(page, PACKAGE_RULES_CONFIG);
  await runAndAwaitResult(page);
  // Roadmap 075 (iteration 6): the run lands on Tests itself (the editor asked
  // for it), and the panel keeps the simulator view across the re-run — so
  // this is the same screen already. Deliberately NOT re-clicking the tab:
  // clicking a tab focuses it, focusing scroll-reveals it, and that scrolls
  // the results column — a 29px shift this test would then blame on the
  // banner. The guarantee under test is the banner's reserved box alone.
  await expect(tabButton(page, "tests")).toHaveAttribute("aria-selected", "true");
  // The banner is gone from view but its box is reserved (visibility, not unmount)…
  await expect(banner).toBeHidden();
  // …so the button sits exactly where the pointer left it.
  const after = must(await simulate.boundingBox(), "the simulate button's bounding box");
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
});

test("the results strip holds one row at the standard desktop width", async ({ page }) => {
  // 083 added the sixth tab (Overview); at the pre-083 tab padding the strip
  // wrapped at 1280px — the default Desktop Chrome viewport — leaving
  // "Problems" alone on a second line. Every tab must share one row here.
  //
  // 089 added the seventh (Dependencies), which is also the longest label in
  // the strip; the tab sides came down again to keep the row (see
  // `16-tabs.css`, and the note there about sizing for the widest common
  // `system-ui` rather than the narrowest).
  await page.goto("/");
  await runAndAwaitResult(page);

  // Scoped to the results strip — the pin card reuses the `.tab-bar` grammar
  // at the card's scale, so a bare `.tab` locator would count its tabs too.
  const tabs = page.getByRole("tablist", { name: "Results" }).locator(".tab");
  await expect(tabs).toHaveCount(7);
  const boxes = await tabs.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
  expect(new Set(boxes).size).toBe(1);
});

test("the layer editor block insets itself from its stage card's edges", async ({ page }) => {
  // 076 moved the global/inherited layer editors from the Advanced drawer
  // (whose body carried the padding) onto the pipeline stage cards — and
  // `.card` gives its body no padding, so the block arrived flush against the
  // card border. The Pipeline Stage Display design pads this section; the
  // block now pads itself like the card's other children do.
  await page.goto("/");
  await runAndAwaitResult(page);
  await openLayerStage(page, "global");
  const block = page.locator("#panel-pipeline .layer-editor-block");
  await expect(block).toHaveCSS("padding-left", "12px");
  await expect(block).toHaveCSS("padding-top", "9.6px");
});
