# 016 — Scale framing, badge glossary, page & editor ergonomics

Milestone: M5 · Status: planned

## Summary

Cross-cutting legibility items from the persona study. Big numbers appear
without framing ("Resolved 1076 preset(s)", "packageRules [ 714 items ]") and
read as "did I break something?" to newcomers whose config is 10 lines. Badge
vocabulary (`2 opts`, `duplicate ×2`, `nested`, `internal`, `overridden`) has
no inline explanation — and `overridden` on an _appended_ array like
`packageRules` is actively misleading. Long pages fight the user: `End` lands
on a blank over-scrolled viewport, there's no back-to-top, re-simulating
resets scroll position, and in-editor edits are hazardous (stale-coordinate
clicks silently replace the wrong line; no visible undo affordance).

## User story

As a user with a small config, I want every large number to carry its origin
("713 rules — 2 from your config, 711 pulled in by `config:recommended`"),
every badge to explain itself on hover like the stage pills already do, and
the page to stay navigable while I bounce between editor, results and
verdicts.

## Scope

- Framing phrase wherever a large count first appears (preset tree header,
  effective config `packageRules` row, simulator heading).
- Hover cards for tree/row badges, reusing the glossary card mechanism from
  the first-load UX pass; reconcile inconsistent counts (712 vs 713 vs 714,
  "1 duplicates" vs "duplicate ×2").
- Replace/augment `overridden` on concatenated arrays with an accurate badge
  (e.g. `appended`).
- Keyboard + scroll: End/Home work; sticky mini-bar (stage pills + Run) or a
  back-to-top affordance; preserve scroll position across re-simulations.
- Editor safety: visible undo/redo hint and a "revert to loaded config"
  button.

## Out of scope

- Simulator results filtering (012) and rule provenance (013).

## Dependencies

- 011 (tree summary header), the first-load UX pass (glossary cards).
