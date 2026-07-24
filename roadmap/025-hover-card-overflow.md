# 025 — Hover card text overflows its box

Milestone: M7 · Status: planned

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
