# 025 — Hover card text overflows its box

Milestone: M7 · Status: done

## Summary

User-reported (2026-07-24, with screenshot): the badge-glossary hover card
(e.g. the "own options" card on preset-tree badges, from the 016 pass)
renders its explanation text flowing past the card's right edge — the card
background ends mid-sentence and the text continues over the page. Long
unwrapped lines and/or a missing max-width/wrapping rule on the shared
glossary-card styling; 44006's expert session also saw option-doc tooltips
occluding unrelated content when scrolled under the cursor, so the hover
layer deserves one consolidated pass.

## User story

As a user hovering a badge to learn what it means, I want the explanation
contained in its card — wrapped, sized, and positioned to stay readable —
not bleeding across the page.

## Scope

- Fix wrapping/sizing on the shared hover-card styles (`.glossary-card` and
  whatever the badge cards use): max-width, `overflow-wrap`, and no
  `white-space` rules that defeat wrapping.
- Audit every hover-card producer (glossary terms, stage explainers, badge
  cards, option-doc cards) with the longest current copy at narrow and wide
  viewports; fix positioning so cards never render off-screen.
- Don't open cards for elements that merely scroll under a stationary
  cursor (the occlusion complaint) — require actual pointer movement onto
  the anchor, matching typical tooltip behavior.

## Out of scope

- Rewriting card copy (022 handles wording).

## Dependencies

- First-load UX pass (glossary cards), 016 (badge cards).

## Delivered

- Root cause: `.option-card`/`.glossary-card` are `position: fixed`, which
  takes them out of layout but not out of the CSS inheritance chain — a
  `.preset-row` ancestor's `white-space: nowrap` still inherited onto the
  card, so multi-sentence copy rendered as one unwrapped line spilling past
  the card's background. Fixed on the shared `.option-card` base: explicit
  `white-space: normal`, `overflow-wrap: anywhere`, and a `max-width`
  fallback for the one producer (the CodeMirror preset-string hover, 023)
  that had never set an inline width at all.
- Audited every producer: glossary terms and stage explainers (`Term`/
  `Explained` in `glossary.tsx`), badge cards (016's preset-tree
  contribution/rollup/source/duplicate/nested badges, `EffectiveConfig`'s
  multi-layer badges), option-doc cards (003's `OptionCard`/`OptionKey`),
  and the preset-string hover (023's CodeMirror tooltip) — all share the
  `.option-card` base class, so the one CSS fix covers all of them. Checked
  each renders contained at 700px, 400px and 300px viewports.
- Horizontal clamping already existed (`Math.max(8, Math.min(left, …))`) but
  used a hardcoded 320/340px width constant that didn't fit sub-320px
  viewports; both `GlossaryCard` and `OptionCard` now clamp the width itself
  to the viewport first.
- Scroll-under-cursor occlusion: `Term`, `Explained` and `OptionKey` opened
  their card on plain `mouseenter`, which also fires when scrolled content
  slides an anchor under an already-stationary cursor. New shared
  `useMoveGatedHover` (`hover-gate.ts`) defers the "show" call to the first
  `mousemove` after `mouseenter` — a pure scroll produces no `mousemove`, so
  it no longer opens a card, while a genuine hover (which always has at
  least a pixel of motion) still opens instantly.
- New permanent e2e assertion (`e2e/08-hover-card-containment.spec.ts`):
  hovering the preset-tree "own options" badge at a 700px viewport asserts
  `scrollWidth <= clientWidth + 1` and that the card's bounding box stays
  within the viewport.

## Deferred

- None.
