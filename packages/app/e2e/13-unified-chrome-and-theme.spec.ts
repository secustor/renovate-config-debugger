import { expect, test, type Locator, type Page } from "@playwright/test";
import { IGNORED_PRESET_CONFIG, SEMANTIC_COMMITS_CONFIG } from "./fixtures";
import {
  gotoAppAtDefaultConfig,
  luminance,
  must,
  openMigrateStage,
  openSessionMenu,
  openPresetTree,
  runAndAwaitResult,
  setEditorContent,
  themeSwitch,
} from "./helpers";

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
    await gotoAppAtDefaultConfig(page);
    expect(await bodyBackground(page)).toBe(LIGHT_BG);

    // Roadmap 066: the switch lives in the header's session menu now.
    await openSessionMenu(page);
    const group = themeSwitch(page);
    await expect(group.getByRole("radio")).toHaveCount(3);
    await expect(group.getByRole("radio", { name: "Auto" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await group.getByRole("radio", { name: "Dark" }).click();
    await expect.poll(() => bodyBackground(page)).toBe(DARK_BG);
    // Roadmap 066: choosing a theme deliberately does NOT dismiss the menu —
    // the point of a theme control is comparing the result of the choice.
    await expect(page.locator(".session-menu-panel")).toBeVisible();

    // Persisted (roadmap 033 storage wrapper) and applied before first paint,
    // so the reloaded page is dark from the start rather than flashing light.
    await page.reload();
    await expect(page.locator(".cm-content")).toContainText("config:recommended");
    expect(await bodyBackground(page)).toBe(DARK_BG);
    await openSessionMenu(page);
    await expect(themeSwitch(page).getByRole("radio", { name: "Dark" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await themeSwitch(page).getByRole("radio", { name: "Auto" }).click();
    await expect.poll(() => bodyBackground(page)).toBe(LIGHT_BG);
  });

  /**
   * Roadmap 039 — the config editor is the one surface that cannot resolve its
   * colors from `color-scheme`: CodeMirror needs a `theme` PROP. Before 039 it
   * read `matchMedia("(prefers-color-scheme: dark)")` once per render, so a
   * user on a light OS who chose Dark got a light editor on a dark page (and
   * vice versa). The body-background assertion above cannot see that — this
   * one measures the editor's own surface.
   */
  test("the config editor follows the switcher, not the OS scheme", async ({ page }) => {
    await gotoAppAtDefaultConfig(page);

    const editor = page.locator(".cm-editor");
    const editorBg = () => editor.evaluate((el) => getComputedStyle(el).backgroundColor as string);
    // The OS says light and no override is stored: a light editor on a light
    // page, i.e. an editor surface no darker than the page around it.
    const lightBg = await editorBg();
    expect(luminance(lightBg)).toBeGreaterThan(0.5);

    await openSessionMenu(page);
    await themeSwitch(page).getByRole("radio", { name: "Dark" }).click();
    await expect.poll(() => editorBg()).not.toBe(lightBg);
    expect(luminance(await editorBg())).toBeLessThan(0.2);

    // …and back, in the same session: the editor is subscribed, not sampled
    // once at mount.
    await themeSwitch(page).getByRole("radio", { name: "Light" }).click();
    await expect.poll(() => editorBg()).toBe(lightBg);
  });

  /**
   * The 035 dark-diff variables moved from `@media (prefers-color-scheme:
   * dark)` to `light-dark()` pairs on `.diff-wrapper` (037). That is only
   * correct if the diff follows the SWITCHER, not the OS — which the
   * 12-layout-regressions contrast test (OS-emulated dark) cannot show.
   */
  test("the diff follows the switcher, not the OS scheme", async ({ page }) => {
    await gotoAppAtDefaultConfig(page);
    await setEditorContent(page, SEMANTIC_COMMITS_CONFIG);
    await runAndAwaitResult(page);
    await openMigrateStage(page);

    const deleted = page.locator("#panel-pipeline .diff-code-delete").first();
    await expect(deleted).toBeVisible();
    const lightBg = await deleted.evaluate((el) => getComputedStyle(el).backgroundColor);

    await openSessionMenu(page);
    await themeSwitch(page).getByRole("radio", { name: "Dark" }).click();
    await expect
      .poll(() => deleted.evaluate((el) => getComputedStyle(el).backgroundColor))
      .not.toBe(lightBg);
    // The dark delete row, verbatim from the `.diff-wrapper` palette (#301c1e).
    expect(await deleted.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      "rgb(48, 28, 30)",
    );
  });
});

/**
 * The old toolbar was a lone button reading "Side-by-side" WHILE UNIFIED WAS
 * ACTIVE — it labelled the action, not the state. A segmented control has to
 * show both modes with exactly one of them marked active.
 */
test("the diff chrome names the active view and offers Copy result (036)", async ({ page }) => {
  await gotoAppAtDefaultConfig(page);
  await setEditorContent(page, SEMANTIC_COMMITS_CONFIG);
  await runAndAwaitResult(page);
  await openMigrateStage(page);
  // Selecting the chip leaves its glossary hover card open under the cursor
  // (roadmap 024/025); park the pointer so it can't swallow the clicks below.
  await page.mouse.move(0, 0);
  await expect(page.locator(".glossary-card")).toHaveCount(0);

  // Roadmap 075: the migrate stage's panel holds two cards — the STAGE card
  // (this test's subject) and the rewrite stepper folded in from the retired
  // Rewrites tab, which renders a diff of its own. Scoped to the stage card so
  // the assertions still describe the stage diff's chrome.
  const stageCard = page.locator("#panel-pipeline .card").first();
  const chrome = stageCard.locator(".diff-chrome");
  await expect(chrome).toBeVisible();

  // Both modes are named, exactly one is active, and the active one is the
  // mode you are IN (unified on arrival).
  const segments = chrome.locator(".seg button");
  await expect(segments).toHaveText(["Unified", "Side-by-side"]);
  await expect(chrome.locator(".seg button.active")).toHaveCount(1);
  await expect(chrome.locator(".seg button.active")).toHaveText("Unified");
  await expect(stageCard.locator(".diff-unified")).toHaveCount(1);

  // The `+N −N` stat: the migration rewrites one line.
  await expect(chrome.locator(".diff-stat .plus")).toHaveText("+1");
  await expect(chrome.locator(".diff-stat .minus")).toHaveText("−1");

  await segments.nth(1).click();
  await expect(chrome.locator(".seg button.active")).toHaveText("Side-by-side");
  await expect(stageCard.locator(".diff-split")).toHaveCount(1);
  await expect(stageCard.locator(".diff-unified")).toHaveCount(0);

  // Roadmap 036: every stage diff can now hand you its resulting config —
  // before, the Pipeline tab offered no way to copy a stage's output at all.
  const copyResult = chrome.getByRole("button", { name: "Copy result" });
  await expect(copyResult).toBeVisible();
  await expect(copyResult).toHaveAttribute("title", /resulting config as JSON/);

  // The chrome bar is a bar: it paints the surface fill and sits above the
  // diff body, not floating over it.
  const [chromeBoxRaw, diffBoxRaw] = await Promise.all([
    chrome.boundingBox(),
    stageCard.locator(".diff-wrapper").boundingBox(),
  ]);
  const chromeBox = must(chromeBoxRaw, "the diff chrome bar's bounding box");
  const diffBox = must(diffBoxRaw, "the diff wrapper's bounding box");
  expect(chromeBox.y + chromeBox.height).toBeLessThanOrEqual(diffBox.y + 1);
  const chromeBg = await chrome.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(chromeBg).not.toBe("rgba(0, 0, 0, 0)");
});

/** A badge's painted fill and border, as the browser resolves them. Width, not
 *  just color: `border: none` leaves `border-top-color` resolving to the
 *  element's own `color`, so only the width says whether a border is drawn. */
function paintOf(badge: Locator) {
  return badge.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      background: style.backgroundColor,
      borderColor: style.borderTopColor,
      borderWidth: style.borderTopWidth,
    };
  });
}

/** Transparent is either the keyword or a zero alpha channel. */
function isTransparent(value: string): boolean {
  return value === "transparent" || /,\s*0\s*\)$/.test(value);
}

/**
 * Badges used to be outline-only, which the design review read as "inactive".
 * One `color-mix(… currentColor 13% …)` rule tints every variant from its own
 * hue — so any badge in the tree that is still a CHIP must paint a background.
 *
 * A later design review pulled the other way for the counts: "N opts" /
 * "N rules" ride every row, and a pill on every row is a fill the eye has to
 * skip past, so they joined `.rollup` as plain muted text. Both halves are
 * asserted here, because "filled" and "deliberately not filled" only mean
 * something together.
 */
test("preset-tree chips are filled, contribution counts are plain text (036)", async ({ page }) => {
  await page.goto("/");
  await setEditorContent(page, IGNORED_PRESET_CONFIG);
  await runAndAwaitResult(page);
  await openPresetTree(page);

  const chip = page.locator("#panel-presets .preset-row .badge.state").first();
  await expect(chip).toBeVisible();
  const chipPaint = await paintOf(chip);
  expect(isTransparent(chipPaint.background), `state badge fill ${chipPaint.background}`).toBe(
    false,
  );
  expect(isTransparent(chipPaint.borderColor), `state badge border ${chipPaint.borderColor}`).toBe(
    false,
  );
  expect(chipPaint.borderWidth).not.toBe("0px");

  const count = page.locator("#panel-presets .preset-row .badge.contrib.opts").first();
  await expect(count).toBeVisible();
  const countPaint = await paintOf(count);
  expect(isTransparent(countPaint.background), `count fill ${countPaint.background}`).toBe(true);
  expect(countPaint.borderWidth).toBe("0px");

  // The tree's rows are all internal presets, and an `internal` pill on all of
  // them said nothing — only a fetched source still earns one.
  await expect(page.locator("#panel-presets .preset-row .badge.src")).toHaveCount(0);
});

test("the header links out to the source and to the issue tracker (055)", async ({ page }) => {
  await page.goto("/");
  // Roadmap 066: the links moved into the header's session menu.
  await openSessionMenu(page);

  const source = page.getByRole("link", { name: "Source on GitHub" });
  const issues = page.getByRole("link", { name: "Report an issue" });

  // 055 located these by accessible name because they were icon-only and had
  // no other name; 066 gave them a visible label, and the name is now that
  // label. Both still open away from the app, and `noreferrer` is what keeps
  // `window.opener` out of the new tab.
  for (const [link, href] of [
    [source, "https://github.com/secustor/renovate-config-debugger"],
    [issues, "https://github.com/secustor/renovate-config-debugger/issues"],
  ] as const) {
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", href);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noreferrer/);
    // The row's own icon — 066 added a second svg to every external row (the
    // out-of-app glyph), so this names the one 055 is about.
    await expect(link.locator("svg.session-menu-item-icon")).toBeVisible();
  }
});
