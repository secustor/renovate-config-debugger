import { expect, test, type Locator, type Page } from "@playwright/test";
import { INVALID_RULES_CONFIG, PACKAGE_RULES_CONFIG, SEMANTIC_COMMITS_CONFIG } from "./fixtures";
import { must, openTab, runAndAwaitResult, setEditorContent } from "./helpers";

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
    await openTab(page, "rewrites");

    for (const kind of ["delete", "insert"] as const) {
      const cell = page.locator(`#panel-rewrites .diff-code-${kind}`).first();
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
 * disclosure in its title bar — the 035 no-orphan-row rule still holds inside
 * the panel, and the panel is a chrome row of the card, not a floating layer.
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

  // It is a row OF the card: it sits under the title bar and above the editor.
  const title = must(
    await page.locator(".config-col .editor-card-title").boundingBox(),
    "the editor card title's bounding box",
  );
  const editor = must(
    await page.locator(".config-col .cm-editor").boundingBox(),
    "the CodeMirror editor's bounding box",
  );
  expect(panelBox.y).toBeGreaterThanOrEqual(title.y + title.height - 1);
  expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(editor.y + 1);
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
 */
test("Format re-indents in place and leaves the revert baseline alone", async ({ page }) => {
  await page.goto("/");
  const editor = page.locator(".cm-content");
  await expect(editor).toContainText("config:recommended");

  const format = page.getByRole("button", { name: "Format", exact: true });
  const revert = page.getByRole("button", { name: "Revert to loaded config" });
  await setEditorContent(page, '{"extends":["config:recommended"],"automerge":true}');
  expect(await editor.locator(".cm-line").count()).toBe(1);

  // Position stability: the conditional Revert sits AFTER Format in the row.
  // Formatting is an edit that summons Revert — were it the other way around,
  // the button under the cursor would jump sideways the moment it was clicked.
  const formatBox = await format.boundingBox();
  const revertBox = await revert.boundingBox();
  expect(formatBox !== null && revertBox !== null && formatBox.x < revertBox.x).toBe(true);

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

/** Selects the first preset in the tree and returns its detail panel. */
async function openFirstPresetDetail(page: Page): Promise<Locator> {
  await openTab(page, "presets");
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

  await openTab(page, "simulator");
  const panel = page.locator("#panel-simulator");
  await expect(panel.locator(".hypothetical-banner")).toBeVisible();
  const simulate = panel.getByRole("button", { name: "Simulate", exact: true });
  const before = must(await simulate.boundingBox(), "the simulate button's bounding box");

  await setEditorContent(page, PACKAGE_RULES_CONFIG);
  await runAndAwaitResult(page);
  await openTab(page, "simulator");
  // The banner is gone from view but its box is reserved (visibility, not unmount)…
  await expect(panel.locator(".hypothetical-banner")).toBeHidden();
  // …so the button sits exactly where the pointer left it.
  const after = must(await simulate.boundingBox(), "the simulate button's bounding box");
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
});
