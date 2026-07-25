import { expect, test, type Page } from "@playwright/test";
import { SEMANTIC_COMMITS_CONFIG } from "./fixtures";
import { openTab, runAndAwaitResult, setEditorContent } from "./helpers";

/**
 * Roadmap 036 + 037 — the unified chrome and the theme switcher.
 *
 * Like 12, these are RENDERED-STATE assertions: the DOM was never the problem,
 * so a copy-level test would have passed against every defect these fix (an
 * outline-only badge that reads as inactive, a toggle labelling the action
 * instead of the state, a theme that only the OS could choose).
 */

/** The app's two body backgrounds (`light-dark(#ffffff, #0d1117)`). */
const LIGHT_BG = "rgb(255, 255, 255)";
const DARK_BG = "rgb(13, 17, 23)";

function bodyBackground(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

test.describe("theme switcher (037)", () => {
  // The OS says light throughout: the point of the switcher is that an
  // explicit choice OUTRANKS `prefers-color-scheme`, and keeps outranking it
  // across a reload.
  test.use({ colorScheme: "light" });

  test("Dark overrides the OS scheme, survives a reload, and Auto gives it back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(".cm-content")).toContainText("config:recommended");
    expect(await bodyBackground(page)).toBe(LIGHT_BG);

    const group = page.getByRole("radiogroup", { name: "Color theme" });
    await expect(group.getByRole("radio")).toHaveCount(3);
    await expect(group.getByRole("radio", { name: "Auto" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await group.getByRole("radio", { name: "Dark" }).click();
    await expect.poll(() => bodyBackground(page)).toBe(DARK_BG);

    // Persisted (roadmap 033 storage wrapper) and applied before first paint,
    // so the reloaded page is dark from the start rather than flashing light.
    await page.reload();
    await expect(page.locator(".cm-content")).toContainText("config:recommended");
    expect(await bodyBackground(page)).toBe(DARK_BG);
    await expect(
      page.getByRole("radiogroup", { name: "Color theme" }).getByRole("radio", { name: "Dark" }),
    ).toHaveAttribute("aria-checked", "true");

    await page
      .getByRole("radiogroup", { name: "Color theme" })
      .getByRole("radio", { name: "Auto" })
      .click();
    await expect.poll(() => bodyBackground(page)).toBe(LIGHT_BG);
  });

  /**
   * The 035 dark-diff variables moved from `@media (prefers-color-scheme:
   * dark)` to `light-dark()` pairs on `.diff-wrapper` (037). That is only
   * correct if the diff follows the SWITCHER, not the OS — which the
   * 12-layout-regressions contrast test (OS-emulated dark) cannot show.
   */
  test("the diff follows the switcher, not the OS scheme", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".cm-content")).toContainText("config:recommended");
    await setEditorContent(page, SEMANTIC_COMMITS_CONFIG);
    await runAndAwaitResult(page);
    await openTab(page, "rewrites");

    const deleted = page.locator("#panel-rewrites .diff-code-delete").first();
    await expect(deleted).toBeVisible();
    const lightBg = await deleted.evaluate((el) => getComputedStyle(el).backgroundColor);

    await page
      .getByRole("radiogroup", { name: "Color theme" })
      .getByRole("radio", { name: "Dark" })
      .click();
    await expect
      .poll(() => deleted.evaluate((el) => getComputedStyle(el).backgroundColor))
      .not.toBe(lightBg);
    // The dark delete row, verbatim from the 035 palette.
    expect(await deleted.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      "rgb(61, 20, 24)",
    );
  });
});

/**
 * The old toolbar was a lone button reading "Side-by-side" WHILE UNIFIED WAS
 * ACTIVE — it labelled the action, not the state. A segmented control has to
 * show both modes with exactly one of them marked active.
 */
test("the diff chrome names the active view and offers Copy result (036)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cm-content")).toContainText("config:recommended");
  await setEditorContent(page, SEMANTIC_COMMITS_CONFIG);
  await runAndAwaitResult(page);
  await openTab(page, "pipeline");
  await page.locator('.stage-chip[data-stage="migrate"]').click();
  // Selecting the chip leaves its glossary hover card open under the cursor
  // (roadmap 024/025); park the pointer so it can't swallow the clicks below.
  await page.mouse.move(0, 0);
  await expect(page.locator(".glossary-card")).toHaveCount(0);

  const chrome = page.locator("#panel-pipeline .diff-chrome");
  await expect(chrome).toBeVisible();

  // Both modes are named, exactly one is active, and the active one is the
  // mode you are IN (unified on arrival).
  const segments = chrome.locator(".seg button");
  await expect(segments).toHaveText(["Unified", "Side-by-side"]);
  await expect(chrome.locator(".seg button.active")).toHaveCount(1);
  await expect(chrome.locator(".seg button.active")).toHaveText("Unified");
  await expect(page.locator("#panel-pipeline .diff-unified")).toHaveCount(1);

  // The `+N −N` stat: the migration rewrites one line.
  await expect(chrome.locator(".diff-stat .plus")).toHaveText("+1");
  await expect(chrome.locator(".diff-stat .minus")).toHaveText("−1");

  await segments.nth(1).click();
  await expect(chrome.locator(".seg button.active")).toHaveText("Side-by-side");
  await expect(page.locator("#panel-pipeline .diff-split")).toHaveCount(1);
  await expect(page.locator("#panel-pipeline .diff-unified")).toHaveCount(0);

  // Roadmap 036: every stage diff can now hand you its resulting config —
  // before, the Pipeline tab offered no way to copy a stage's output at all.
  const copyResult = chrome.getByRole("button", { name: "Copy result" });
  await expect(copyResult).toBeVisible();
  await expect(copyResult).toHaveAttribute("title", /resulting config as JSON/);

  // The chrome bar is a bar: it paints the surface fill and sits above the
  // diff body, not floating over it.
  const [chromeBox, diffBox] = await Promise.all([
    chrome.boundingBox(),
    page.locator("#panel-pipeline .diff-wrapper").boundingBox(),
  ]);
  expect(chromeBox).not.toBeNull();
  expect(diffBox).not.toBeNull();
  expect(chromeBox!.y + chromeBox!.height).toBeLessThanOrEqual(diffBox!.y + 1);
  const chromeBg = await chrome.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(chromeBg).not.toBe("rgba(0, 0, 0, 0)");
});

/**
 * Badges used to be outline-only, which the design review read as "inactive".
 * One `color-mix(… currentColor 13% …)` rule tints every variant from its own
 * hue — so any badge in the tree must now paint a background.
 */
test("preset-tree badges are filled, not outlines (036)", async ({ page }) => {
  await page.goto("/");
  await runAndAwaitResult(page);
  await openTab(page, "presets");

  const badge = page.locator("#panel-presets .preset-row .badge:not(.rollup)").first();
  await expect(badge).toBeVisible();
  const { background, border } = await badge.evaluate((el) => {
    const style = getComputedStyle(el);
    return { background: style.backgroundColor, border: style.borderTopColor };
  });
  // Transparent is either the keyword or a zero alpha channel.
  for (const [name, value] of Object.entries({ background, border })) {
    expect(value, `badge ${name} is ${value}`).not.toBe("transparent");
    expect(/,\s*0\s*\)$/.test(value), `badge ${name} is fully transparent (${value})`).toBe(false);
  }
});
