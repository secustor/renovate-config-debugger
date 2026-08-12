import { expect, test } from "@playwright/test";
import {
  encodeShareFragment,
  EXTENDS_RECOMMENDED_CONFIG,
  PACKAGE_RULES_CONFIG,
  RECOMMENDED_NODE_IDENTITY,
  SEMANTIC_COMMITS_CONFIG,
} from "./fixtures";
import {
  must,
  openTab,
  resultsPanel,
  runAndAwaitResult,
  setEditorContent,
  tabButton,
  tabPanel,
} from "./helpers";

/**
 * Roadmap 028 — the tabbed results shell. Everything the pipeline produces
 * now lives in one panel of mutually-exclusive tabs: a run lands on a short
 * Overview, every instrument is one click away with its size advertised by a
 * count badge, and panels stay mounted so per-tab state survives switching.
 */

test("a run lands on the Overview tab, not on an expanded instrument", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cm-content")).toContainText("config:recommended");
  await runAndAwaitResult(page);

  await expect(tabButton(page, "overview")).toHaveAttribute("aria-selected", "true");
  await expect(tabPanel(page, "overview")).toBeVisible();
  // The heavy instruments are mounted but hidden — nothing is expanded on
  // arrival.
  await expect(tabPanel(page, "presets")).toBeHidden();
  await expect(tabPanel(page, "effective")).toBeHidden();
  await expect(tabPanel(page, "simulator")).toBeHidden();
  // The Overview's question pills are the only navigation besides the tabs.
  await expect(page.getByRole("button", { name: "What did each stage change?" })).toBeVisible();
});

test("tab badges report the run's counts and match the Overview digest", async ({ page }) => {
  await page.goto("/");
  await runAndAwaitResult(page);

  // Presets: a real, large resolved tree from config:recommended.
  const presetsCount = tabButton(page, "presets").locator(".tab-count");
  await expect(presetsCount).toBeVisible();
  const presets = Number((await presetsCount.innerText()).replace(/\D/g, ""));
  expect(presets).toBeGreaterThan(1);

  // Effective config: reported by the view once provenance is computed.
  const effectiveCount = tabButton(page, "effective").locator(".tab-count");
  await expect(effectiveCount).toBeVisible({ timeout: 30_000 });
  const effective = Number((await effectiveCount.innerText()).replace(/\D/g, ""));
  expect(effective).toBeGreaterThan(0);

  // Roadmap 029: the digest paragraph quotes exactly the same numbers.
  const digest = page.locator(".run-digest");
  await expect(digest).toContainText(`${presets.toLocaleString("en-US")} presets`);
  await expect(digest).toContainText(`${effective} effective options`);
});

/**
 * Roadmap 029 — the Overview is a paragraph of prose, not a dashboard: it
 * opens with the verdict, and every number in it is a way into the tab that
 * explains it.
 */
test("the Overview digest narrates the run and its links switch tabs", async ({ page }) => {
  await page.goto("/");
  await runAndAwaitResult(page);

  const digest = page.locator(".run-digest");
  await expect(digest).toBeVisible();
  // The verdict comes first, in plain English.
  await expect(digest).toContainText(/Renovate accepted this config/);
  // …then what the extends actually cost.
  await expect(digest.locator('[data-clause="presets"]')).toContainText(/expanded into/);

  // A digest link is a way into the instrument behind the number.
  await digest.locator('[data-clause="presets"] .digest-link').click();
  await expect(tabPanel(page, "presets")).toBeVisible();
  await expect(tabButton(page, "presets")).toHaveAttribute("aria-selected", "true");
  // It is a jump, not a tab click, so one step goes back (028).
  await expect(page.locator(".tab-back")).toHaveText(/Back to Overview/);
});

test("a zero-count tab stays visible, dimmed and clickable, showing its empty state", async ({
  page,
}) => {
  await page.goto("/");
  // The default config uses only current option names — nothing to rewrite.
  await runAndAwaitResult(page);

  const rewrites = tabButton(page, "rewrites");
  await expect(rewrites).toBeVisible();
  await expect(rewrites.locator(".tab-count")).toHaveText("0");
  await expect(rewrites).toHaveClass(/\bempty\b/);
  // Dimmed, never hidden or disabled.
  const opacity = await rewrites.evaluate((el) => getComputedStyle(el).opacity);
  expect(Number(opacity)).toBeLessThan(1);

  await openTab(page, "rewrites");
  await expect(tabPanel(page, "rewrites")).toContainText("No rewrites");

  // The same tab carries a count and the stepper once a run does rewrite.
  await setEditorContent(page, SEMANTIC_COMMITS_CONFIG);
  await runAndAwaitResult(page);
  await expect(tabButton(page, "rewrites").locator(".tab-count")).toHaveText("1");
  await openTab(page, "rewrites");
  await expect(tabPanel(page, "rewrites")).toContainText("Step 1 of 1");
});

/**
 * The windowing pitfall: the preset tree and its flat table mount inside a
 * hidden panel, where the scroll container measures 0 and would window down
 * to almost no rows. Revealing the tab has to produce a full screenful — the
 * flat table (one row per resolved preset, ~1,000 of them) is where a
 * mismeasured viewport shows up unmistakably.
 */
test("the windowed preset table renders a full screenful when revealed from a hidden tab", async ({
  page,
}) => {
  await page.goto("/");
  await runAndAwaitResult(page);

  await openTab(page, "presets");
  // The tree itself is collapsed on arrival — one row per extends entry.
  await expect(page.locator("#panel-presets .preset-row").first()).toBeVisible();

  // Roadmap 036: `.preset-view-toggle` generalized into the shared `.seg`.
  await page.locator("#panel-presets .preset-controls .seg button", { hasText: "table" }).click();
  const rows = page.locator("#panel-presets .preset-table-row");
  await expect(rows.first()).toBeVisible();
  // Polled: the window settles on the container's real height on the next
  // measurement, whether the panel was just revealed or the view just grew.
  await expect.poll(() => rows.count(), { timeout: 10_000 }).toBeGreaterThan(15);
});

test("switching tabs preserves the preset tree's search and expansion state", async ({ page }) => {
  await page.goto("/");
  await runAndAwaitResult(page);

  await openTab(page, "presets");
  const search = page.locator("#panel-presets .preset-search");
  await search.fill("group");
  const rows = page.locator("#panel-presets .preset-row");
  await expect(rows.first()).toBeVisible();

  // Expand a row so there is tree state to lose, too.
  await page.locator("#panel-presets").getByRole("button", { name: "Expand" }).first().click();
  const names = page.locator("#panel-presets .preset-row .preset-name");
  // The search box is debounced: wait for the tree to have actually narrowed
  // before treating what it shows as the state that must survive the switch.
  await expect(names.nth(1)).toHaveText(/group/i);
  // The first rows of the filtered, expanded list — the tree renders from the
  // top, so these are stable regardless of how many rows the window mounts.
  const before = (await names.allInnerTexts()).slice(0, 3);
  expect(before).toHaveLength(3);

  // Leave and come back: the panel was hidden, never unmounted.
  await openTab(page, "pipeline");
  await expect(tabPanel(page, "presets")).toBeHidden();
  await openTab(page, "presets");

  await expect(search).toHaveValue("group");
  await expect(rows.first()).toBeVisible();
  await expect
    .poll(async () => (await names.allInnerTexts()).slice(0, 3), { timeout: 10_000 })
    .toEqual(before);
  // The expanded row is still expanded, not collapsed back.
  await expect(
    page.locator("#panel-presets").getByRole("button", { name: "Collapse" }).first(),
  ).toBeVisible();
});

test("a provenance chip switches to Presets and offers a one-step way back", async ({ page }) => {
  await page.goto("/");
  await runAndAwaitResult(page);

  await openTab(page, "effective");
  const chip = page
    .locator('#panel-effective .badge.prov-layer.prov-preset[role="button"]')
    .first();
  await expect(chip).toBeVisible();
  await chip.click();

  // The jump landed in the Presets tab with the node selected…
  await expect(tabPanel(page, "presets")).toBeVisible();
  await expect(tabButton(page, "presets")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#panel-presets .preset-name.selected")).toBeVisible();

  // …and a back affordance names where the user came from.
  const back = page.locator(".tab-back");
  await expect(back).toHaveText(/Back to Effective config/);
  await back.click();
  await expect(tabButton(page, "effective")).toHaveAttribute("aria-selected", "true");
  await expect(back).toHaveCount(0);

  // An explicit tab click is not a jump — it clears the affordance.
  await openTab(page, "presets");
  await expect(page.locator(".tab-back")).toHaveCount(0);
});

test("the Overview's 'where did a setting come from' pill opens and focuses the filter", async ({
  page,
}) => {
  await page.goto("/");
  await runAndAwaitResult(page);

  await page.getByRole("button", { name: "Where did a setting come from?" }).click();

  await expect(tabPanel(page, "effective")).toBeVisible();
  const filter = page.locator("#panel-effective .prov-filter-input");
  await expect(filter).toBeFocused();
  await expect(page.locator(".tab-back")).toHaveText(/Back to Overview/);
});

test("a copied share link reopens on the tab that was active", async ({ page }) => {
  await page.goto("/");
  await runAndAwaitResult(page);
  await openTab(page, "simulator");

  await page.getByRole("button", { name: "Copy link" }).click();
  // Copy link mirrors the token into the address bar even when the clipboard
  // itself is unavailable (headless has no clipboard permission), so the URL
  // is both the reliable thing to reopen and the signal that the async encode
  // has finished.
  await expect.poll(() => page.url(), { timeout: 15_000 }).toContain("#config=");
  const url = page.url();

  await page.goto("about:blank");
  await page.goto(url);
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  await expect(tabButton(page, "simulator")).toHaveAttribute("aria-selected", "true");
});

test("pre-028 links without a tab field map stage/step/node to the right tab", async ({ page }) => {
  // `stage` — every link this app ever produced carried one → Pipeline.
  await page.goto(
    await encodeShareFragment({ config: PACKAGE_RULES_CONFIG, view: { stage: "validate" } }),
  );
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  await expect(tabButton(page, "pipeline")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#panel-pipeline .card-title")).toContainText("Stage: Validate");

  // `step` — the sender was stepping through rewrites → Rewrites.
  await page.goto("about:blank");
  await page.goto(
    await encodeShareFragment({
      config: SEMANTIC_COMMITS_CONFIG,
      view: { stage: "migrate", step: 0 },
    }),
  );
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  await expect(tabButton(page, "rewrites")).toHaveAttribute("aria-selected", "true");

  // `node` — the sender had a preset selected → Presets.
  await page.goto("about:blank");
  await page.goto(
    await encodeShareFragment({
      config: EXTENDS_RECOMMENDED_CONFIG,
      view: { stage: "preset", node: RECOMMENDED_NODE_IDENTITY },
    }),
  );
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  await expect(tabButton(page, "presets")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#panel-presets .preset-name.selected")).toBeVisible();
});

test("a narrow viewport stacks the panes and a run scrolls the results into view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 720 });
  await page.goto("/");
  await expect(page.locator(".cm-content")).toContainText("config:recommended");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await runAndAwaitResult(page);

  // Stacked: the results pane starts below the config pane, full width.
  const geometry = await page.evaluate(() => {
    const configEl = document.querySelector(".config-col");
    const resultsEl = document.querySelector(".results-col");
    if (!configEl || !resultsEl) {
      throw new Error("expected .config-col and .results-col to be present");
    }
    return { config: configEl.getBoundingClientRect(), results: resultsEl.getBoundingClientRect() };
  });
  expect(geometry.results.top).toBeGreaterThan(geometry.config.top);
  expect(Math.abs(geometry.results.width - geometry.config.width)).toBeLessThan(2);

  // 023's land-on-the-consequence: the results end up on screen rather than
  // below the fold, where Run would look like it did nothing.
  //
  // Asserted as the OUTCOME, not as "the page scrolled". This used to demand
  // `scrollY > 0`, which was a proxy for the same thing while the header wrapped
  // to two lines at this width once a run added the version badge. 066 collapsed
  // the session corner to one control, the header stopped wrapping, and the panel
  // now clears the fold on its own — the same contract reached without the scroll.
  // The threshold is ResultsColumn's own MIN_VISIBLE_RESULTS_PX.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const el = document.querySelector(".results-col");
          if (!el) {
            return 0;
          }
          const rect = el.getBoundingClientRect();
          return Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
        }),
      { timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(200);
  const box = must(
    await page.locator(".results-panel").boundingBox(),
    "the results panel's bounding box",
  );
  expect(box.y).toBeLessThan(720);
});

/**
 * Design review: the two columns sit side by side, so a reader has every
 * reason to assume they describe each other — but after an edit (or a Revert)
 * the results kept showing the previous run with nothing to say so. The shell's
 * run-level banner slot says it, on whichever tab the reader is on.
 */
test("the results say so once the config has changed since the run", async ({ page }) => {
  await page.goto("/");
  await runAndAwaitResult(page);

  const stale = page.locator(".stale-banner");
  await expect(stale).toHaveCount(0);

  await setEditorContent(page, PACKAGE_RULES_CONFIG);
  await expect(stale).toBeVisible();
  await expect(stale).toContainText("changed since this run");

  // Still there on another tab — the run is stale, not one instrument.
  await openTab(page, "effective");
  await expect(stale).toBeVisible();

  // Running against the edited text is what clears it.
  await runAndAwaitResult(page);
  await expect(stale).toHaveCount(0);

  // …and so does going back: Revert is an edit like any other.
  await setEditorContent(page, SEMANTIC_COMMITS_CONFIG);
  await expect(stale).toBeVisible();
  await page.getByRole("button", { name: "Revert to loaded config" }).click();
  await expect(stale).toBeVisible();
});
