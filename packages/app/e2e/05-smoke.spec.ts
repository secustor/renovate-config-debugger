import { expect, test } from "@playwright/test";

/**
 * Journey 5 — first-load smoke. A fresh visit (no share link) shows the welcome
 * strip, keeps Advanced options collapsed, and renders a glossary hover card
 * with a docs link when a term is hovered.
 */
test("first load shows the welcome strip, collapsed advanced options, and a glossary hover card", async ({
  page,
}) => {
  await page.goto("/");

  // Welcome strip is visible (it only renders before the first result).
  const welcome = page.locator(".welcome");
  await expect(welcome).toBeVisible();
  await expect(welcome).toContainText("Bring a config");

  // Advanced options exist but are collapsed (the <details> is not open).
  const advanced = page.locator("details.advanced-zone");
  await expect(advanced).toBeVisible();
  const isOpen = await advanced.evaluate((el) => (el as HTMLDetailsElement).open);
  expect(isOpen).toBe(false);

  // No pipeline has run yet: no timeline.
  await expect(page.locator(".stage-timeline")).toHaveCount(0);

  // Hovering a glossary term in the welcome copy renders its hover card with a
  // Renovate docs link.
  const term = welcome.locator(".term").first();
  await term.hover();
  const card = page.locator(".glossary-card");
  await expect(card).toBeVisible({ timeout: 5_000 });
  const docsLink = card.getByRole("link", { name: /Renovate docs/ });
  await expect(docsLink).toBeVisible();
  await expect(docsLink).toHaveAttribute("href", /docs\.renovatebot\.com/);
});
