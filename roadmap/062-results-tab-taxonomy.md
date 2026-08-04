# 062 — Results tabs: `Simulator` becomes `packageRules`, `Extraction` joins it

Milestone: M17 · Status: proposed — deferred until the current simulator work
(054's remaining variants) has stabilized

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
