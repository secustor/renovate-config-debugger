import { expect, test } from "@playwright/test";
import { gotoAppAtDefaultConfig, must, openPresetTree, runAndAwaitResult } from "./helpers";

/**
 * Roadmap 025 — a badge-glossary hover card used to inherit `white-space:
 * nowrap` from its `.preset-row` ancestor (position: fixed takes a card out
 * of layout, not out of the CSS inheritance chain), so multi-sentence copy
 * rendered as one unwrapped line that spilled past the card's background.
 * Guard both symptoms directly: the card's content must actually wrap (no
 * horizontal overflow) and the card itself must never render off-screen.
 */
test("the preset-tree 'own options' hover card wraps its text and stays on-screen at a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await gotoAppAtDefaultConfig(page);
  await runAndAwaitResult(page);
  await openPresetTree(page);

  await page.getByRole("button", { name: "Expand" }).first().click();
  const badge = page.locator(".badge.contrib.opts.explained").first();
  await expect(badge).toBeVisible();
  await badge.scrollIntoViewIfNeeded();
  await badge.hover();

  const card = page.locator(".glossary-card").first();
  await expect(card).toBeVisible({ timeout: 5_000 });
  await expect(card).toContainText("own options");

  const metrics = await card.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  // Text wraps inside the box rather than overflowing it.
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);

  const box = must(await card.boundingBox(), "the hover card's bounding box");
  const viewport = must(page.viewportSize(), "the page's viewport size");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
});

/**
 * Design review follow-up — the editor's JSON-schema hover is `position:
 * fixed`, and nothing bounded it: a docs URL on one unbreakable line sized
 * the tooltip to ~800px, running it across the results column with no
 * border or shadow to mark it as a popover. Guard the fix: the tooltip is
 * width-capped, opaque, and framed.
 */
test("the editor's schema hover is a bounded popover, not a page-wide strip", async ({ page }) => {
  await gotoAppAtDefaultConfig(page);

  // The schema layer loads lazily, so the first hover may land before the
  // hover extension exists — retry until the tooltip materializes. Hover by
  // coordinates a few characters into the line, squarely on the `"extends"`
  // KEY: the string value beside it opens the preset card instead.
  const line = page.locator(".cm-line", { hasText: '"extends"' }).first();
  const lineBox = must(await line.boundingBox(), "the extends line's bounding box");
  const tooltip = page.locator(".cm-tooltip");
  for (let attempt = 0; attempt < 5 && !(await tooltip.isVisible()); attempt++) {
    await page.mouse.move(10, 10);
    await page.mouse.move(lineBox.x + 30, lineBox.y + lineBox.height / 2);
    await page.waitForTimeout(1_500);
  }
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator(".cm6-json-schema-hover")).toBeVisible();

  const box = must(await tooltip.boundingBox(), "the schema tooltip's bounding box");
  // 26rem cap (416px) plus padding and border, with room to spare.
  expect(box.width).toBeLessThanOrEqual(450);

  const chrome = await tooltip.evaluate((el) => {
    const s = getComputedStyle(el);
    return { background: s.backgroundColor, borderWidth: s.borderTopWidth };
  });
  // Opaque popover surface with a frame — not the syntax theme's bare strip.
  expect(chrome.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(chrome.borderWidth).toBe("1px");
});
