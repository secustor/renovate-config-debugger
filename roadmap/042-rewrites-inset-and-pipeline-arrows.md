# 042 — Rewrites inset + Pipeline order arrows

Milestone: M10 · Status: done (2026-07-26)

Mockup (approved, variants 1B + 2A):
[mockups/042/rewrites-padding-and-pipeline-order.html](mockups/042/rewrites-padding-and-pipeline-order.html)

## Summary

A 2026-07-26 user report on the post-041 app found two defects in the
results column. The **Rewrites** tab prints the step head, the
explanation and the nav flush against the card border, and the
explanation shows the engine's markdown backticks as literal characters.
The **Pipeline** tab's eight stage chips are a wrapping flex row: on one
line left-to-right reads as execution order, but the moment they wrap
nothing says whether reading continues on the next line or the lines are
parallel groups.

## Scope

- **Rewrites inset (variant 1B).** Root cause: `.card` deliberately
  carries no body padding — every child brings its own inset (that is how
  `.card-title`, `.diff-chrome` and `.stage-crosslink` work) — and
  `.migration-steps` brought none. The three TEXT rows take the card's
  `0.75rem` while `JsonDiff` stays full-bleed, the same grammar the
  Pipeline card's stage diff already uses. The rules hang off the card
  context (`.card > .migration-steps > …`), not off `.migration-steps`
  itself, so the compact stepper embedded in preset rows
  (`.preset-migration-steps`, never a card child) is untouched.
- **Backticks render as code.** The engine writes migration explanations
  with markdown backticks (`migration-names.ts`) and the app already owns
  the renderer — `CodeText`, born in 029 inside `OverviewTab`. It is
  hoisted verbatim into a shared `components/CodeText.tsx` and the
  explanation renders through it, with an inline-code chip style scoped
  to `.migration-explanation`.
- **Pipeline order arrows (variant 2A).** A muted `→` between consecutive
  chips, rendered as its own flex item so a wrapped line leads with an
  arrow — the "this continues from above" cue that was missing. Chip
  geometry is unchanged; the separators are `aria-hidden` decoration,
  not focusable, no handler.

Rejected, recorded: **1A** (one padded body, diff becomes a nested
bordered panel — simpler CSS but two diff framings in one app); **2B**
(ordinals inside the chips — a permanent extra character next to the dot
and count already there); **2C** (joined segments — loses the pill
silhouette the rest of the app uses, and the wrap point still needs
interpretation); **2D** (no wrap, horizontal scroll — hides stages at
exactly the widths where the problem occurs, and an error dot on a
scrolled-off stage is worse than an ambiguous wrap).

## Dependencies

- 004 (the migration stepper this insets), 024 (the stage chips the
  arrows join), 028 (the tabs that gave Rewrites its own card), 029
  (`CodeText`'s origin in the run digest), 036 (the card / full-bleed
  diff grammar the inset follows).

## What was done

- **`.card > .migration-steps > …` insets.** `.migration-step-head` gets
  `0.6rem 0.75rem 0`, `.migration-explanation` `0 0.75rem`, and
  `.migration-nav` `0 0.75rem 0.75rem` — outer edges only, because the
  stepper's own `0.6rem` flex gap already separates the rows. The diff
  keeps running edge to edge. Verified that the preset-row stepper, one
  level down inside `.preset-migration-steps`, is not matched.
- **`components/CodeText.tsx`.** The 029 component moved out of
  `OverviewTab` unchanged, 041 index-key comment and inline oxlint
  disable included; `OverviewTab` imports it instead of defining it, and
  `MigrationSteps` renders
  `<p className="migration-explanation"><CodeText … /></p>`. The
  resulting `<code>` gets a lighter `.migration-step-key`: surface
  background, 1px border, 4px radius, `0.85em`, `0.05em 0.3em` padding.
- **`.stage-sep` in `StageTimeline`.** The map is keyed by stage id in a
  `Fragment` that emits the separator before every chip but the first,
  as a sibling OUTSIDE the `Explained` wrapper so the hover card still
  belongs to the chip alone. `.stage-timeline` drops to
  `column-gap: 0.15rem` (`row-gap` stays `0.4rem`) so the arrows do not
  widen the row. No test selector assumed the timeline's children were
  only buttons — the suites address chips by `[data-stage]` or by
  descendant `.dot` — so none needed changing.
- Verification: `pnpm lint` (silent), `typecheck`, `format:check`, app
  `test:unit` (178 tests; the 032 keystroke invariant still measures 0
  panel re-renders), `build`, and all 49 e2e tests.
