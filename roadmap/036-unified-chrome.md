# 036 — Unified chrome: filled badges, one copy button, diff toolbar

Milestone: M10 · Status: done (2026-07-25)

Mockup (approved): [mockups/036/unified-chrome.html](mockups/036/unified-chrome.html)

## Summary

A user design review of 2026-07-25 found the results surfaces speaking
four different control dialects: badges are outline-only and read as
inactive; "Copy migrated config", "Copy as markdown", "Copy link" and
"Copy link with this simulation" are three unrelated implementations
with three visual styles and heights; the Pipeline tab's stage diffs
(Migrate, Massage, …) offer no way to copy the stage's resulting
config at all; and the `JsonDiff` toolbar is an unstyled default button
that says "Side-by-side" _while unified is active_ — labeling the
action, not the state (the exact confusion already hit in the 035
review) — with "Show all" buried in an `empty-note` below the diff.

## Scope

- **Filled badges**: one generic rule tints every badge from its own
  hue — `background: color-mix(in srgb, currentColor 13%, transparent)`
  (border softened the same way) — so all ~15 variants (preset source,
  state, contrib, rollup, provenance layer, overridden/appended/merged)
  get a fill without any per-variant colors and text contrast is
  untouched. Solid fills were considered and rejected in the mockup:
  white-on-warn fails contrast at 0.7rem and saturated chips overpower
  the rows they annotate. Deliberate exceptions keep their meaning:
  `elided` (dashed = collapsed chain) and `rollup` (borderless).
- **One `<CopyButton>` component**: clipboard icon + label, shared
  copied-state (icon flips to a check, label to "Copied"), quiet
  clipboard failure, **one size everywhere** — replaces
  `CopyMarkdownButton`'s rendering (its markdown-building stays as a
  thin wrapper), `MigrationSteps`' inline handler, and the plain
  toolbar buttons "Copy link" / "Copy link with this simulation".
- **Copy the stage result**: the diff chrome row gains "Copy result",
  copying the diff's `after` JSON. Because it lives in `JsonDiff`,
  Migrate and Massage get it — and so do every other stage, the
  preset-detail diffs and the per-rewrite diffs, for free. The Rewrites
  tab keeps its separate "Copy migrated config" (final config ≠ the
  current step's output).
- **Diff chrome row**: the floating toolbar becomes a chrome bar
  (surface background, bottom border — the same grammar as card
  titles): title · `+N −N` stat · segmented `[Unified | Side-by-side]`
  control with an active state (the `.preset-view-toggle` pattern) ·
  Copy result. The truncation note becomes a footer bar with a real
  "Show all N lines" button. Every control in a chrome row shares one
  height.

## Out of scope

- The light/dark theme switcher — 037.
- Any behavior change to what the diffs show (truncation budget, hover
  docs, `$schema` widgets stay as-is).

## Dependencies

- 018 (CopyMarkdownButton), 004 (rewrites stepper), 028 (tabbed shell
  the chrome unifies), 035 (the dark-diff custom-property approach the
  chrome bar must not disturb).

## What was done

- **Filled badges** — `.badge` now derives BOTH its fill
  (`color-mix(in srgb, currentColor 13%, transparent)`) and its border
  (`… 32% …`) from `currentColor`. Every variant was reduced to a bare
  `color` declaration: a `border-color` of its own would have
  out-specified the softening, and with the border derived there is
  nothing left for a variant to say. `.elided` (dashed) and `.rollup`
  (borderless) keep their opt-outs; the two `background: transparent`
  button resets (`button.badge.dup`, `.badge.prov-layer[role=button]`)
  were dropped so a clickable badge fills like a static one.
- **`components/CopyButton.tsx`** — clipboard/check octicon + label,
  1.5 s copied state, quiet failure, one size. `getText` builds the
  payload lazily; `onCopy` covers the share link, which writes the
  clipboard itself. `inSummary` swallows the click that would toggle a
  surrounding `<details>`. Now behind: `CopyMarkdownButton` (kept as
  the markdown-building wrapper, call sites untouched),
  `MigrationSteps`' "Copy migrated config", the toolbar's "Copy link"
  and the simulator's "Copy link with this simulation" — four
  hand-rolled copied-state timers gone. `.copy-md` and
  `.migration-copy` are deleted; `.toolbar button` and
  `.migration-nav button` gained `:not(.copy-btn)` so a descendant
  selector cannot out-specify the shared size.
- **Copy result** — in `JsonDiff`, so Migrate, Massage, every other
  stage, the preset-detail diffs and the per-rewrite diffs all gained
  it at once.
- **Diff chrome** — `.diff-chrome` bar (title · `+N −N` · segmented
  `[Unified | Side-by-side]` · Copy result) above the diff and a
  `.diff-foot` bar with a real "Show all N lines" button below it. The
  stat counts the whole diff, not the truncated render. `.diff-wrapper`
  is untouched, so the 035 custom-property scoping still holds.
- **`.seg`** — `.preset-view-toggle` generalized into the one segmented
  control, shared with the diff chrome and the 037 theme switcher, and
  written for N segments. Its font-size and padding are `.copy-btn`'s,
  so a chrome row cannot mix two control heights.
- Tests: `src/components/CopyButton.test.tsx` (4) and
  `e2e/13-unified-chrome-and-theme.spec.ts` (the segmented control's
  active state, the split switch, Copy result, filled badges).
