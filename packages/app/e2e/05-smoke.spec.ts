import { expect, test } from "@playwright/test";
import { resultsPanel } from "./helpers";

/**
 * Journey 5 — first-load smoke. A fresh visit (no share link) shows the
 * landing, keeps Advanced options collapsed, and renders a glossary hover card
 * with a docs link when a term is hovered.
 *
 * Roadmap 075 replaced 040's welcome strip with the landing (the page's
 * question, one Run, and the stage rail); the three facts this pins are the
 * same three, read off what the landing shows instead.
 */
test("first load shows the landing, collapsed advanced options, and a glossary hover card", async ({
  page,
}) => {
  await page.goto("/");

  // The landing is what renders before the first result.
  const landing = page.locator(".config-col.landing");
  await expect(landing).toBeVisible();
  await expect(landing.locator(".landing-title")).toContainText(
    "What does your Renovate config actually do?",
  );
  await expect(landing.locator(".landing-steps")).toContainText("Bring a config");

  // Advanced options exist but are collapsed (the <details> is not open).
  const advanced = page.locator("details.advanced-zone");
  await expect(advanced).toBeVisible();
  const isOpen = await advanced.evaluate((el) => (el as HTMLDetailsElement).open);
  expect(isOpen).toBe(false);

  // No pipeline has run yet: no results shell.
  await expect(resultsPanel(page)).toHaveCount(0);

  // Hovering a glossary term on the landing — the stage rail names four
  // Renovate concepts — renders its hover card with a Renovate docs link.
  const term = landing.locator(".term").first();
  await term.hover();
  const card = page.locator(".glossary-card");
  await expect(card).toBeVisible({ timeout: 5_000 });
  const docsLink = card.getByRole("link", { name: /Renovate docs/ });
  await expect(docsLink).toBeVisible();
  await expect(docsLink).toHaveAttribute("href", /docs\.renovatebot\.com/);
});
