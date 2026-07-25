# 035 — Layout polish + regression tests

Milestone: M10 · Status: done (2026-07-25)

## Summary

User-reported (2026-07-25, with a screenshot of a ~1000px-wide post-run
two-pane layout). Five separate defects, all of them invisible to the
existing e2e suite because in every case the DOM was correct and only its
rendered geometry or color was wrong:

1. The repo-load form's **"Load" button wrapped onto a row of its own**. The
   form was a single `flex-wrap: wrap` row whose natural width (label + repo
   input + branch input + button ≈ 640px) exceeded the post-run left column
   (`.app-split.has-results` caps it near 580px), so the button was always
   the item pushed to the next line.
2. …and, once wrapped, it **touched the editor card**: `.repo-load` had no
   bottom margin and `.card` has no top margin.
3. **"Revert to loaded config" always looked active.** It rendered
   permanently with `disabled={content === loadedContent}`, but
   `.toolbar button.secondary` had no `:disabled` styling — enabled and
   disabled were pixel-identical, so the button read as broken rather than
   inapplicable.
4. **Diff text was unreadable in dark mode** — near-white on the light
   `#fdeff0`/`#eaffee` react-diff-view backgrounds. A regression from
   roadmap 031 (see below).
5. **The preset detail pane was cramped and clipped.** Its split with the
   tree stacked only under `@media (max-width: 60rem)` — a VIEWPORT query
   tuned before 028 moved this card inside the results column. Post-028 the
   card is ~3/5 of the page, so the detail pane was squeezed to ~420px while
   the viewport query never came close to firing, and both panes were capped
   at a hard `max-height: 34rem` that clipped the last `<details>`.

## Issue 4 was a 031 regression: CSS chunk-order inversion

The dark-mode diff rules overrode react-diff-view's own `.diff-code-delete`
/ `.diff-code-insert` / `.diff-gutter-*` selectors at **equal specificity**,
so which stylesheet won was decided purely by load ORDER. That order held by
accident for as long as the library's stylesheet was part of the entry CSS.
Roadmap 031 moved `react-diff-view/style/index.css` (imported by
`components/JsonDiff.tsx`) into the lazily-imported `ResultsColumn` chunk,
which loads **after** the entry stylesheet — the library's light backgrounds
started winning, while the text color kept coming from the app (the
library's `--diff-text-color: initial` makes `color: var(--diff-text-color)`
invalid-at-computed-value-time, i.e. inherited). Measured on the pre-fix
build: `rgb(240, 246, 252)` on `rgb(253, 239, 240)` — a contrast ratio of
**1.03:1**.

The fix keeps the lazy split. react-diff-view 3.3.3 is entirely CSS
custom-property driven and declares its defaults on `:root`, so the dark
theme is now expressed as those same variables **scoped on `.diff-wrapper`**
(the element JsonDiff already wraps every diff in). Element-scoped variables
beat `:root` defaults on proximity regardless of which stylesheet loaded
last, so the theme can no longer be un-done by a chunking change. Each
`--diff-*-text-color` is restated explicitly rather than left to cascade
from `--diff-text-color`: the library's `--diff-code-delete-text-color:
var(--diff-text-color)` is resolved **at `:root`**, where it is already
guaranteed-invalid, so overriding `--diff-text-color` further down the tree
would not reach it.

The guard is a permanent e2e assertion (see below) that computes the real
WCAG contrast ratio from the rendered page, which fails at 1.03:1 on the
pre-fix build.

## What was done

- **Repo-load form (1 + 2)**: the label now owns its own line and the two
  inputs plus the submit button share one `flex-wrap: nowrap` row
  (`.repo-load-row`, a new wrapper div in `App.tsx`). The repo field is the
  shrinkable element (`flex: 1 1 auto; min-width: 0` — without the explicit
  zero minimum a text input's intrinsic width stops the row from shrinking
  at all), the branch field shrinks to a 7rem floor, and the button is the
  only non-shrinking item, so it can never be orphaned. `.repo-load` gained
  a real bottom margin (`0.5rem 0 0.75rem`).
- **Revert button (3)**: rendered only when `content !== loadedContent` —
  absence is the honest signal for an action that has nothing to do. The
  `disabled` prop is gone (it is always enabled when rendered); the title
  and `secondary` class are unchanged. A generic
  `.toolbar button:disabled { opacity: 0.55; cursor: default }` was added so
  no other toolbar button can silently repeat the same defect.
- **Dark diff theme (4)**: as described above.
- **Preset split (5)**: the tree/detail split is now driven by a
  **container query** on a new `.preset-split` wrapper
  (`@container preset-split (max-width: 52rem)`), replacing the 60rem
  viewport media query for this component. The detail pane's minimum track
  is 24rem rather than 20rem, so that just above the stacking threshold the
  4fr share (~370px) cannot leave it narrower than an embedded diff needs.
  Both scrollers changed from a hard `max-height: 34rem` to
  `min(44rem, calc(100dvh - 10rem))` (tuned against the sticky results
  column's `top: 0.75rem`), and `.preset-panel` gained bottom padding so its
  last `<details>` ends clear of the scroller's edge instead of looking
  clipped. While stacked **and** a panel is open, the tree is capped at
  `min(26rem, calc(100dvh - 24rem))`: stacked, the tree sits between the row
  the user clicked and the detail it opened, and a full-height tree would
  push that detail below the fold — the 023 land-on-the-consequence rule.
- **Glossary hover cards are portalled to `<body>`** (`glossary.tsx`). Their
  coordinates are viewport coordinates, which only hold while no ancestor is
  a containing block for fixed-position descendants — and `container-type`
  applies layout containment, which creates exactly that. Without the portal
  the container query above would have silently re-anchored every preset-tree
  badge card to the card element (a 025 regression). The portal makes the
  viewport-relative math structurally true rather than incidental.
  (`OptionCard`, the other `.option-card` producer, already renders at the
  `OptionDocsProvider` root, outside any container.)

## Regression tests

New `packages/app/e2e/12-layout-regressions.spec.ts` — four tests, one per
symptom, all geometry/contrast rather than copy:

1. **Dark diff contrast** (`test.use({ colorScheme: "dark" })`): runs the
   `semanticCommits` migration fixture, then computes the WCAG 2.1 contrast
   ratio between each `.diff-code-delete`/`.diff-code-insert` cell's
   resolved `color` and the nearest painted ancestor background, asserting
   ≥ 4.5:1. Verified to fail (1.03:1) with the variable block disabled.
2. **Load-button row integrity**: post-run, the button's vertical centre
   matches both inputs' to within 2px, the row does not overflow the form,
   and the gap to the editor card is ≥ 6px.
3. **Revert visibility**: absent on load → visible after an edit → absent
   again after clicking it, with the loaded config restored.
4. **PresetDetail usability**: no horizontal clipping
   (`scrollWidth <= clientWidth + 1`) and either ≥ 380px wide or stacked to
   a single track, checked at two viewport widths; the panel opens within
   one screen of its card's top; and the last section ("Contribution to the
   merged config") scrolls fully inside the panel's box.

Suite: 39 existing + 4 new = 43, all green.

## Deviations from the brief

- **Issue 5(b) needed no change.** The brief expected `JsonDiff` to default
  to side-by-side inside `PresetDetail`; it already defaults to `unified`
  everywhere (`useState<"unified" | "split">("unified")`), and no call site
  overrides it. The toggle BUTTON is labelled "Side-by-side" while unified
  is active (it names the action, not the state), which is the likely source
  of the screenshot reading. Left as-is; renaming the toggle would be a copy
  change, not a layout fix.
- **The repo-root `renovate.json` was committed with invalid JSON** (a
  missing comma after `extends`, from `chore: run pnpm dedupe on renovate
upgrades`). It made `pnpm format` fail repo-wide, independently of this
  work; fixed here because the verification gate requires a clean `format`.

## Dependencies

- 028 (the two-pane shell and results column these all live in), 031 (the
  chunk split that inverted the CSS order), 025 (the hover-card positioning
  the portal preserves), 023 (land-on-the-consequence).
