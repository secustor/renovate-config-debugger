import { expect, test } from "@playwright/test";
import {
  encodeShareFragment,
  EXTENDS_RECOMMENDED_CONFIG,
  INVALID_RULES_CONFIG,
  PACKAGE_RULES_CONFIG,
  RECOMMENDED_NODE_IDENTITY,
  SEMANTIC_COMMITS_CONFIG,
} from "./fixtures";
import {
  must,
  openMigrateStage,
  openPresetTree,
  openTab,
  resultsPanel,
  runAndAwaitResult,
  setEditorContent,
  tabButton,
  tabPanel,
} from "./helpers";

/**
 * Roadmap 028 — the tabbed results shell. Everything the pipeline produces
 * lives in one panel of mutually-exclusive tabs: every instrument is one click
 * away with its size advertised by a count badge, and panels stay mounted so
 * per-tab state survives switching.
 *
 * Roadmap 075 (v2, iteration 3) reshaped the strip itself:
 * `Tests · Pipeline · Presets · Effective config · Problems`. Tests is the
 * simulator, first and where a run lands; Rewrites folded into Pipeline's
 * migrate stage; Overview retired into the header's digest links.
 */

test("a run lands on the Tests tab, not on an expanded instrument", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cm-content")).toContainText("config:recommended");
  await runAndAwaitResult(page);

  await expect(tabButton(page, "tests")).toHaveAttribute("aria-selected", "true");
  await expect(tabPanel(page, "tests")).toBeVisible();
  // …and Tests is the pinned dependency tests (075 iteration 6, Proposal F
  // funnel): the empty state explains a pin, the Add-a-test form is open.
  await expect(tabPanel(page, "tests")).toContainText("No tests pinned yet");
  await expect(tabPanel(page, "tests")).toContainText("+ Pin a dependency…");
  // The heavy instruments are mounted but hidden — nothing is expanded on
  // arrival.
  await expect(tabPanel(page, "presets")).toBeHidden();
  await expect(tabPanel(page, "effective")).toBeHidden();
  await expect(tabPanel(page, "pipeline")).toBeHidden();
  // Five tabs, in the v2 order — scoped to the results tablist, because the
  // Add-a-test box reuses the same tab grammar inside the Tests panel.
  await expect(page.getByRole("tablist", { name: "Results" }).locator(".tab")).toHaveText([
    /^Tests/,
    /^Pipeline/,
    /^Presets/,
    /^Effective config/,
    /^Problems/,
  ]);
});

test("tab badges report the run's counts and match the header digest", async ({ page }) => {
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

  // Roadmap 029/075: the header's digest links quote exactly the same numbers —
  // the guarantee the Overview paragraph used to carry, moved to the header.
  const digest = page.locator(".app-header-digest");
  await expect(digest).toContainText(`${presets.toLocaleString("en-US")} presets`);
  await expect(digest).toContainText(`${effective} effective options`);
});

/**
 * Roadmap 075 (v2, iteration 2) — the header carries the run: its verdict as a
 * status pill, and the digest as jump-links into the instrument each number
 * describes. The numbers come from the same derivation the tab badges do, so
 * this pins both halves — they agree, and each link lands.
 */
test("the header states the verdict and its digest links open the instruments", async ({
  page,
}) => {
  await page.goto("/");
  await runAndAwaitResult(page);

  const header = page.locator(".app-header");
  await expect(header.locator(".app-header-status")).toHaveText(/accepted/);

  // The presets clause quotes the Presets badge, to the digit.
  const presetsCount = tabButton(page, "presets").locator(".tab-count");
  await expect(presetsCount).toBeVisible();
  const presets = (await presetsCount.innerText()).trim();
  const presetsLink = header.getByRole("button", { name: `${presets} presets` });
  await expect(presetsLink).toBeVisible();

  await presetsLink.click();
  await expect(tabPanel(page, "presets")).toBeVisible();
  await expect(tabButton(page, "presets")).toHaveAttribute("aria-selected", "true");
  // A jump, not a tab click: the one-step way back is recorded (028).
  await expect(page.locator(".tab-back")).toHaveText(/Back to Tests/);

  // And the problems clause lands on Problems from wherever the reader is.
  await header.getByRole("button", { name: "0 problems" }).click();
  await expect(tabButton(page, "problems")).toHaveAttribute("aria-selected", "true");
});

/**
 * The other half of the verdict: a config Renovate would refuse says so in the
 * header, in the error tone, with the count it will find in Problems.
 */
test("the header's status pill reports validation errors instead of accepted", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cm-content")).toContainText("config:recommended");
  await setEditorContent(page, INVALID_RULES_CONFIG);
  await runAndAwaitResult(page);

  const pill = page.locator(".app-header .app-header-status");
  await expect(pill).toHaveClass(/pill-error/);
  await expect(pill).toHaveText(/\d+ errors?/);
});

/**
 * Roadmap 075 (v2, iteration 3) — the Rewrites tab folded into Pipeline. Its
 * stepper is the migrate stage's now, and the header's `N rewrites` link is
 * what takes a reader there: one click has to select BOTH the tab and the
 * stage, or it lands on a pipeline showing something else entirely.
 */
test("the header's rewrites link opens Pipeline on the migrate stage's stepper", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".cm-content")).toContainText("config:recommended");
  await setEditorContent(page, SEMANTIC_COMMITS_CONFIG);
  await runAndAwaitResult(page);

  const header = page.locator(".app-header");
  await header.getByRole("button", { name: "1 rewrite" }).click();

  await expect(tabButton(page, "pipeline")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#panel-pipeline .card-title").first()).toContainText("Stage: Migrate");
  // The retired tab's card, in place: the stepper and its own title.
  await expect(tabPanel(page, "pipeline")).toContainText("Rewrites");
  await expect(tabPanel(page, "pipeline")).toContainText("Step 1 of 1");
  // It is a jump, not a tab click, so one step goes back (028).
  await expect(page.locator(".tab-back")).toHaveText(/Back to Tests/);

  // A run with nothing to rewrite says so on the same stage, rather than
  // leaving the reader wondering where the stepper went.
  await setEditorContent(page, EXTENDS_RECOMMENDED_CONFIG);
  await runAndAwaitResult(page);
  await openMigrateStage(page);
  await expect(tabPanel(page, "pipeline")).toContainText("No rewrites");
});

test("a zero-count tab stays visible, dimmed and clickable, showing its empty state", async ({
  page,
}) => {
  await page.goto("/");
  // The default config is one Renovate accepts outright — nothing to report.
  await runAndAwaitResult(page);

  const problems = tabButton(page, "problems");
  await expect(problems).toBeVisible();
  await expect(problems.locator(".tab-count")).toHaveText("0");
  await expect(problems).toHaveClass(/\bempty\b/);
  // Dimmed, never hidden or disabled.
  const opacity = await problems.evaluate((el) => getComputedStyle(el).opacity);
  expect(Number(opacity)).toBeLessThan(1);

  await openTab(page, "problems");
  // Roadmap 075 (iteration 5): the tab's empty state is its summary strip —
  // the same sentence slot that carries the counts once there are any.
  await expect(tabPanel(page, "problems").locator(".summary-strip")).toContainText(
    "No problems — this config is accepted.",
  );
  await expect(tabPanel(page, "problems").locator(".problem-card")).toHaveCount(0);

  // The same tab carries a count and the cards once a run does report something.
  await setEditorContent(page, INVALID_RULES_CONFIG);
  await runAndAwaitResult(page);
  await expect(problems.locator(".tab-count")).not.toHaveText("0");
  await openTab(page, "problems");
  await expect(tabPanel(page, "problems").locator(".summary-strip")).toContainText("1 error");
  await expect(tabPanel(page, "problems").locator(".problem-card").first()).toBeVisible();
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

  // 075 (iteration 5b): the tab opens on the ledger; the tree is one click in.
  await openPresetTree(page);
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

  await openPresetTree(page);
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

/**
 * Roadmap 069/075 — "What this config does" was the Overview's second card and
 * leads the Effective config tab now: it describes the merged config's own
 * `description` field, and its "show raw order" link lands on that field's row,
 * which since the move is a landing inside the tab the reader is already on.
 */
test("the description digest card leads the Effective config tab and lands on its row", async ({
  page,
}) => {
  await page.goto("/");
  await runAndAwaitResult(page);

  await openTab(page, "effective");
  const card = page.locator("#panel-effective .desc-digest-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("What this config does");

  await card.getByRole("button", { name: "show raw order" }).click();
  // Same tab, so no cross-tab trail is recorded — just the row, filtered to and
  // expanded.
  await expect(tabButton(page, "effective")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#panel-effective .prov-filter-input")).toHaveValue("description");
  await expect(page.locator(".tab-back")).toHaveCount(0);
});

test("a copied share link reopens on the tab that was active", async ({ page }) => {
  await page.goto("/");
  await runAndAwaitResult(page);
  await openTab(page, "effective");

  await page.locator(".app-header").getByRole("button", { name: "Share" }).click();
  // The header's Share mirrors the token into the address bar even when the clipboard
  // itself is unavailable (headless has no clipboard permission), so the URL
  // is both the reliable thing to reopen and the signal that the async encode
  // has finished.
  await expect.poll(() => page.url(), { timeout: 15_000 }).toContain("#config=");
  const url = page.url();

  await page.goto("about:blank");
  await page.goto(url);
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  await expect(tabButton(page, "effective")).toHaveAttribute("aria-selected", "true");
});

test("pre-028 links without a tab field map stage/step/node to the right tab", async ({ page }) => {
  // `stage` — every link this app ever produced carried one → Pipeline.
  await page.goto(
    await encodeShareFragment({ config: PACKAGE_RULES_CONFIG, view: { stage: "validate" } }),
  );
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  await expect(tabButton(page, "pipeline")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#panel-pipeline .card-title")).toContainText("Stage: Validate");

  // `step` — the sender was stepping through rewrites → Pipeline, on the
  // migrate stage the stepper lives on since 075.
  await page.goto("about:blank");
  await page.goto(
    await encodeShareFragment({
      config: SEMANTIC_COMMITS_CONFIG,
      view: { stage: "preset", step: 0 },
    }),
  );
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  await expect(tabButton(page, "pipeline")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#panel-pipeline .card-title").first()).toContainText("Stage: Migrate");
  await expect(tabPanel(page, "pipeline")).toContainText("Step 1 of 1");

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

/**
 * Roadmap 075 (v2, iteration 3) — the tab ids `overview`, `simulator` and
 * `rewrites` are gone from the strip, but every link shared while they existed
 * still names one. Nothing encodes them any more; the DECODER maps each onto
 * the tab that replaced it, so an old link opens on what its sender meant.
 */
test("a share link naming a retired tab lands on the tab that replaced it", async ({ page }) => {
  // `overview` — the digest it opened on is the header's now, so the link lands
  // where a run lands.
  await page.goto(
    await encodeShareFragment({ config: PACKAGE_RULES_CONFIG, view: { tab: "overview" } }),
  );
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  await expect(tabButton(page, "tests")).toHaveAttribute("aria-selected", "true");

  // `simulator` — the same instrument, renamed (and, since iteration 6, the
  // Tests tab's second view: the link lands on the tab, the pins list leads).
  await page.goto("about:blank");
  await page.goto(
    await encodeShareFragment({ config: PACKAGE_RULES_CONFIG, view: { tab: "simulator" } }),
  );
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  await expect(tabButton(page, "tests")).toHaveAttribute("aria-selected", "true");
  await expect(tabPanel(page, "tests")).toContainText("No tests pinned yet");

  // `rewrites` — Pipeline, AND the migrate stage, or the stepper the sender was
  // pointing at is not on screen.
  await page.goto("about:blank");
  await page.goto(
    await encodeShareFragment({
      config: SEMANTIC_COMMITS_CONFIG,
      view: { stage: "preset", tab: "rewrites", step: 0 },
    }),
  );
  await expect(resultsPanel(page)).toBeVisible({ timeout: 30_000 });
  await expect(tabButton(page, "pipeline")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#panel-pipeline .card-title").first()).toContainText("Stage: Migrate");
  await expect(tabPanel(page, "pipeline")).toContainText("Step 1 of 1");
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
