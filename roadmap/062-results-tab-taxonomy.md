# 062 — Results tabs: `Simulator` becomes `packageRules`, `Extraction` joins it

Milestone: M17 · Status: **superseded in part** (see the 2026-08-23 addendum) —
the rename shipped by another route in M20; the `Extraction` slot is what is
still proposed, and still deferred until 063 is picked up

Renumbered from 056 (2026-08-05): main took 056–061 for the packages and
agent-debug-interface milestones.

## Summary

`Simulator` is named after the mechanism, not the thing it simulates. That was
unambiguous while there was one simulator; 063 adds a second, and then both
tabs simulate and the name distinguishes nothing. Rename the existing tab to
**`packageRules`** — the config key it actually reproduces — and reserve
**`Extraction`** beside it for 063.

This item is the rename and the empty slot only. It carries no new behavior,
which is the point: it lands cheaply and independently, so 063 arrives into a
taxonomy that is already correct instead of renaming a tab a user just learned.

## User story

As someone who has just learned what the Simulator tab does, I want each tab
named after the Renovate phase it reproduces, so that a second simulator does
not make the first one's name meaningless.

## Scope

- `results-tabs.ts`: label `Simulator` → `packageRules`; add the `Extraction`
  id and label, ordered **before** `packageRules`.
- `use-run-summary.ts`: tab descriptor list follows the same order.
- Call sites that name the tab: `App.tsx` (`jumpToTab`), `OverviewTab.tsx`
  (`onOpen`), and the `openTab(page, …)` calls across the e2e suite (~15).
- Until 063 lands, `Extraction` either stays out of `RESULTS_TAB_IDS` entirely
  or renders an explicit "not built yet" panel — never an empty tab that reads
  as a broken one.

## Decisions

- **Name tabs after the Renovate phase, not the mechanism.** `packageRules` is
  spelled as the config key, matching how the app already borrows upstream
  vocabulary; `Extraction` is upstream's own word for the `extractPackageFile`
  phase, and unlike `Managers` or `Regex` it privileges neither custom manager
  type.
- **Order mirrors Renovate's execution order**: extraction produces the
  dependencies, `packageRules` are applied to them afterwards. The Pipeline tab
  already teaches by ordering; the tab strip should not contradict it.
- **The tab id is share-link wire format — keep `simulator` as the id.**
  `view.tab` is encoded into links and validated against `RESULTS_TAB_IDS`
  (`input-schemas-zod.ts`). Decode already tolerates an unknown tab (the link
  opens without selecting one), so a renamed id would degrade quietly rather
  than break — but silently losing the sender's selection is precisely what 017
  and 027 exist to prevent. Changing the label while leaving the id alone costs
  nothing and risks nothing. If the id is ever renamed for tidiness, it needs a
  legacy mapping in the same shape as `legacyTabForView`.
- **Its own commit, landed before 063.** The change is mechanical but spans the
  e2e specs; bundling it into the feature would make that diff unreviewable.

## Verification

- `11-tabbed-shell.spec.ts` covers the strip: both tabs present, in pipeline
  order, selected by accessible name.
- A share-link test asserts a link carrying `tab: "simulator"` still opens on
  the renamed tab — the compatibility claim above, made executable.

## Addendum — 2026-08-23: read the Summary and the Decisions, not the Scope

Everything above was written against the pre-v2 shell, and M20 rebuilt that
shell. An implementer following the Scope section today would edit files that
have moved and rename a tab that no longer exists, so what still holds is
recorded here rather than by rewriting the proposal.

**The rename already happened, by a different route.** 075 recast the simulator
as **Tests** — pinned dependency descriptors re-checked on every run — and 080
ruled that the Tests grammar SUCCEEDS the simulator rather than renaming it,
leaving the old simulator as the Tests tab's per-dependency detail view. So the
problem this item opens with ("`Simulator` is named after the mechanism") is
solved: no tab is called `Simulator`, and `packageRules` as a label is not
available for the taking either — the strip is `Overview · Tests · Pipeline ·
Presets · Effective config · Problems` (six tabs, pinned to one row at 1280px
by a layout-regression spec, so a seventh is a measurement, not a free slot).

**What the Scope section names, and where it is now.** `results-tabs.ts` is
`src/data/results-tabs.ts`; `use-run-summary.ts` is `src/app/use-run-summary.ts`;
`App.tsx` is `src/app/App.tsx` and still has `jumpToTab`; `OverviewTab.tsx`
never existed under that name and its 083 successor is
`src/features/overview/OverviewPanel.tsx`; the e2e `openTab(page, id)` helper is
still `e2e/helpers.ts`.

**The third decision was taken, and proved.** The tab id is share-link wire
format: 075 renamed the LABEL and retired `simulator` to a decode-only id that
`resultsTabForShareTab` maps forward to `tests` (`shareTabWantsMigrateStage`
does the same job for `rewrites`), and `resultsTabIdSchema`
(`lib/input-schemas-zod.ts`) validates both sets. `lib/share.test.ts` asserts a
link carrying `tab: "simulator"` opens on Tests — this document's executable
compatibility claim, kept. 083 then showed the other direction: `overview` left
the legacy list and became a current id again, needing no machinery at all.

**What is still proposed** is the second half only: an `Extraction` slot for
063, plus the two decisions that outlive the shell — name a tab after the
Renovate phase it reproduces, and order the strip by execution order, so
extraction (which produces the dependencies) precedes the tab that shows the
rules acting on them. The "never an empty tab that reads as a broken one" rule
stands unchanged. Where `Extraction` lands relative to 083's `Overview`, and
what the six-tab row measurement costs, are 063's to settle.
