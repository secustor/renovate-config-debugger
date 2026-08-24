# 049 — Feature-layer expansion: editor, presets

Milestone: M13 · Status: done (2026-07-27)

Follow-up to [048](048-app-decomposition-and-depth-ratchet.md), driven by
a consumer-map review of `components/` (both `@/components/...` and
relative imports) against the research report's promotion rule and layer
principles.

## What the review found

18 of the 33 modules in `components/` have 2+ consumers spanning the
simulator feature and the app shell — the folder already is a legitimate
shared layer, and those files stay. The rest sorted into:

- **`features/editor/`** — seven files whose only consumers are the app
  shell (`ConfigEditor`, `ConfigEditorCard`, `ConfigToolbar`,
  `RepoLoadForm`, `WelcomePanel`, `NoticeBar`, `AdvancedZone`): the
  config-input column as a feature, mirroring how `features/simulator/`
  was justified. All their imports point downward into shared, so
  `app → features → shared` holds with no lint change.
- **`SummaryDrawer` → `features/simulator/`** — its only three consumers
  are simulator drawers. This reverses reevaluation 1's deferral (no
  shared→feature demotion rule survived the research verification); the
  move was made on an explicit user request for the grouping, with
  colocation as the argument.
- **`features/presets/`** — `PresetTree.tsx` (1,321 lines) decomposed
  into ten colocated files on the simulator precedent: the `memo` top
  component keeps all shared state; `TreeRow`, `PresetListPane`,
  `PresetDetail`, `SummaryHeader`, `OriginFraming` get component files;
  `rows.ts` holds the flatten/table logic, `tree-shared.ts` the
  cross-file constants and helpers, `use-window.ts` /
  `use-engine-helpers.ts` the two reusable hooks. No barrel. This
  discharges 048's "PresetTree stays as-is per when-next-touched".
- **Rejected: per-results-tab micro-features** (`OverviewTab`,
  `StageTimeline`+`StageDiff`, `MessagesPanel`, `EffectiveConfig`) —
  each would be a one-file folder whose supporting cast must stay in
  shared (the simulator or presets also consume it): structure without
  content, against the evolutionary-staging principle.

## Boundary corrections the lint forced

- `preset-tree-stats.ts` stays in `components/`:
  `hooks/use-run-summary.ts` is a shared-layer file and the boundary
  forbids shared → `@/features` imports.
- `ErrorTranslationView` is genuinely shared (`MessagesPanel` +
  simulator), not a simulator stray.

## Verification

Full suite per commit: typecheck, lint (the existing overrides cover the
new folders with no config change), format, 219 app unit tests, build,
59/59 e2e — zero test edits beyond mechanical import paths (including
two `vi.mock` module paths in `keystroke-render.test.tsx` — since renamed and
moved to `src/app/keystroke-render.shimmed.test.tsx`, the filename being what
assigns it to the shimmed vitest project).

## Addendum — 2026-08-20: `features/effective-config/` now exists

The rejection above was premised on `EffectiveConfig` being a one-file
folder whose supporting cast had to stay shared. That premise expired:
roadmaps 069 and 075 grew the view four members nothing else consumes —
`BlameLedger.tsx`, `description-ledger.ts`, `decider-groups.ts`,
`drop-reasons.ts`. Five files with a single set of consumers is content,
not structure, so the folder is now real.

The one shared → future-feature edge the boundary forbade was
`hooks/use-run-summary.ts` (and `App.tsx`) importing `EffectiveStats`
from `EffectiveConfig.tsx` — an alias that was literally
`= EffectiveTally`, re-exported from `lib/effective-tally.ts` since 058.
Deleting the alias and pointing both at `@/lib/effective-tally` removed
the edge, and the move needed no lint config change.

The genuinely shared derivations stay in shared: `effective-tally.ts`,
`description-attribution.ts`, `rule-selectors.ts`, `value-preview.ts`,
`components/rule-framing.tsx` — each has consumers outside the view, and
`effective-tally.ts` and `rule-selectors.ts` are on the headless (CLI)
path. `description-attribution.ts` is not — it appears nowhere in
`lib/headless.ts` — but it is shared on the ordinary grounds: several
consumers across two layers. (Deliberately not an enumeration any more:
084's EffectiveConfig split added a fourth, and a list goes stale every
time a view is decomposed.)

Two other corrections in the section above also expired the same day:
`preset-tree-stats.ts` moved to `lib/` (it is pure, and three `lib/`
modules plus `headless.ts` were reaching up into `components/` for it),
and `ErrorTranslationView` moved to `features/simulator/` — 075 gave the
Problems tab its own `ProblemCard`, leaving the simulator its only
consumer.
