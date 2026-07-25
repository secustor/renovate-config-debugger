# 040 — JSX-depth ratchet: decompose the three monoliths to maxDepth 4

Milestone: M10 · Status: planned (2026-07-26)

## Summary

Measured 2026-07-26: above JSX nesting depth 4, every violation in the
app lives in exactly three files — `App.tsx` (71 sites, nesting to
depth 10), `RuleSimulator.tsx` (20), `PresetTree.tsx` (10). Every other
component already complies, so **depth ≤ 4 is the codebase's own
empirical norm** — the right lint threshold encodes the standard the
well-factored code already meets and flags only the debt. Going lower
would criminalize idiomatic markup (126 sites at depths 3–4 are
card-title > button > svg-shaped, spread across well-factored files).

`react/jsx-max-depth` counts element nesting within one JSX
expression; extraction resets the counter at component boundaries —
the rule is therefore a decomposition driver with a measurable exit
criterion, continuing 033 with an enforcement net 033 lacked.

## Scope

Ratchet, so CI enforces every step and each tightening commit stays
reviewable:

1. **Enable `react/jsx-max-depth: ["error", { "maxDepth": 6 }]`** —
   52 sites, only the three monoliths fail. Decompose to green:
   App.tsx's toolbar, welcome section, layers editor, token/share rows;
   RuleSimulator's form and verdict panels; PresetTree's detail panel
   sections (each extraction must preserve the 032 memo/latest-ref
   idioms — no new unstable props into memoized panels).
2. **Tighten to 5** (21 further sites at today's shape) — decompose to
   green.
3. **Tighten to 4** (28 further) — decompose to green. End state: the
   config permanently pins the house norm; a NEW component nested 5+
   deep fails CI instead of sailing through.

Each step lands as its own commit with the full suite green; the e2e
suite is the behavior-preservation net (033's rule: extractions are
behavior-preserving, proven by untouched tests).

## Out of scope

- Depth below 4 — negative value on this codebase's idioms (recorded so
  the debate doesn't repeat).
- Any behavior or visual change; this is pure code shape.
- A component library (rejected — see 039).

## Dependencies

- 033 (the decomposition pattern and its hook extractions), 039 (its
  Button/RepoLoadPanel extractions shrink App.tsx's list first), 032
  (render invariants every extraction must preserve, guarded by
  `keystroke-render.test.tsx`).
