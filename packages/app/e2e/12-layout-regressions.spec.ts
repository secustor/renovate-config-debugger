import { expect, test, type Locator, type Page } from "@playwright/test";
import { PACKAGE_RULES_CONFIG, SEMANTIC_COMMITS_CONFIG } from "./fixtures";
import { openTab, runAndAwaitResult, setEditorContent } from "./helpers";

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
 * its own — and, with no bottom margin on the form, landed flush against the
 * editor card.
 */
test("the Load button stays on its inputs' row and clear of the editor card", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cm-content")).toContainText("config:recommended");
  // Two-pane mode: the left column is at its narrowest, which is where the
  // button used to break away.
  await runAndAwaitResult(page);
  await expect(page.locator(".app-split.has-results")).toBeVisible();

  const button = await page.locator(".repo-load button").boundingBox();
  const branch = await page.locator(".repo-load-branch").boundingBox();
  const repo = await page.locator(".repo-load-ref").boundingBox();
  expect(button).not.toBeNull();
  expect(branch).not.toBeNull();
  expect(repo).not.toBeNull();

  expect(Math.abs(centerOf(button!) - centerOf(branch!))).toBeLessThanOrEqual(2);
  expect(Math.abs(centerOf(button!) - centerOf(repo!))).toBeLessThanOrEqual(2);
  // Nothing overflows the column either — the row shrinks its inputs instead.
  const form = await page.locator(".repo-load").boundingBox();
  expect(button!.x + button!.width).toBeLessThanOrEqual(form!.x + form!.width + 1);

  // The form no longer touches the card below it.
  const card = await page.locator(".config-col .card").first().boundingBox();
  expect(card).not.toBeNull();
  expect(card!.y - (form!.y + form!.height)).toBeGreaterThanOrEqual(6);
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
    const layout = el.closest(".preset-tree-layout")!;
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
  const [cardBox, openedAt] = await Promise.all([
    page.locator("#panel-presets .card").first().boundingBox(),
    panel.boundingBox(),
  ]);
  expect(cardBox).not.toBeNull();
  expect(openedAt).not.toBeNull();
  expect(openedAt!.y - cardBox!.y).toBeLessThan(720);

  // The panel's own last section can be reached — it is not clipped off the
  // bottom of a fixed-height box.
  const last = panel.locator("summary", { hasText: "Contribution to the merged config" });
  await expect(last).toHaveCount(1);
  await last.scrollIntoViewIfNeeded();
  const [lastBox, panelBox] = await Promise.all([last.boundingBox(), panel.boundingBox()]);
  expect(lastBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(lastBox!.y).toBeGreaterThanOrEqual(panelBox!.y - 1);
  expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(panelBox!.y + panelBox!.height + 1);
});
