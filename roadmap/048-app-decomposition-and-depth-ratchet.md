# 048 — App decomposition + depth ratchet to 3

Milestone: M13 · Status: in progress (2026-07-26)

Research basis (commissioned for this work, adversarially verified):
[2026-07-vite-structure-research.md](2026-07-vite-structure-research.md)

## Summary

Post-047 the app package has four components exceeding the codebase's own
structural norms: `RuleSimulator.tsx` (2,791 lines), `App.tsx` (1,563),
`EffectiveConfig.tsx` (555), `AdvancedZone.tsx` (507) — together holding
all 34 JSX-depth-4 sites blocking the next `react/jsx-max-depth` ratchet
step. Grounded in the research report: introduce a feature layer
incrementally, decompose via named custom hooks and colocated
subcomponents, no barrels. The work runs as an implement → reevaluate
loop: after each verified pass, the tree is re-judged against the
research principles and the next significant improvement is implemented,
until none remain (user decision 2026-07-26: the loop may extend beyond
the initial four files — e.g. `PresetTree` hook extraction, the
`app → features → shared` import-restriction lint — with this doc updated
to match).

## Scope

- **`features/simulator/`** — the first `features/` folder.
  `RuleSimulator.tsx` splits into colocated files: the subcomponents
  already living inside it (verdict card, merge stops, form grid, drawer
  wiring) plus custom hooks for the nameable stateful concerns (form
  state + updateType derivation, simulation execution,
  drawer/step/share-link state). Shared state stays lifted in the top
  component — hooks share logic, not state. Types stay inline; no
  `index.ts` — direct imports only.
- **`App.tsx`, `EffectiveConfig.tsx`, `AdvancedZone.tsx`** — targeted
  in-place extractions, enough to clear their 21 depth hits; no feature
  folders yet (promotion happens when files are touched, per the
  evolutionary rule).
- **Ratchet commit**: `react/jsx-max-depth` 4 → 3 as the exit criterion,
  extending the 040 series (6 → 5 → 4 → 3), with the config comment
  updated to record it.
- **Promotion rule honored**: anything in `components/` whose only
  consumer turns out to be the simulator moves into the feature;
  everything with ≥2 consumers stays shared.
- **Loop iterations** beyond the first pass are recorded here as they
  land, each judged against the research principles (nameable-concept
  hook extraction, colocation, promotion rule, no barrels) rather than
  line counts.

## Non-goals

- No behavior change — the 59-test e2e suite pins this; any e2e edit
  means the refactor changed behavior.
- No big-bang `features/` migration: folders appear only as files are
  touched.
- No lint additions beyond the ratchet in the first pass (the
  import-restriction rule is a candidate for a later loop iteration).

## Verification

Full suite per iteration: typecheck, lint (at the ratcheted depth),
unit, build, e2e — green with zero test edits.
