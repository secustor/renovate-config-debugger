import { expect, test } from "@playwright/test";
import { must, openTab, runAndAwaitResult } from "./helpers";

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
  await page.goto("/");
  // Default editor content (config:recommended) needs no fixture — it's
  // bundled with Renovate, so resolving it needs no network.
  await expect(page.locator(".cm-content")).toContainText("config:recommended");
  await runAndAwaitResult(page);
  await openTab(page, "presets");

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
