# 048 — App decomposition + depth ratchet to 3

Milestone: M13 · Status: done (2026-07-27, three loop iterations)

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

## Loop record

- **Iteration 1** (three parallel agents): `features/simulator/` (30
  files, 7 named hooks, RuleSimulator 2,791 → 434 lines), the App/
  EffectiveConfig/AdvancedZone depth extractions, and the 4 → 3 ratchet.
- **Reevaluation 1** (full-tree audit): found one real layer inversion
  (`ResultsColumn`, a shared-layer file importing the feature), rated
  the boundary lint + `useRunSummary` + the 045/repo-load hook
  extractions SIGNIFICANT; rejected with evidence an AdvancedZone pass
  (zero hook calls), a PresetTree feature split (fails "when next
  touched"), and a SummaryDrawer demotion (no demotion rule survived
  verification).
- **Iteration 2**: `ResultsColumn` → app shell; `no-restricted-imports`
  overrides pin `app → features → shared` (oxlint overrides REPLACE
  rule options, so both overrides restate the renovate/dist group —
  measured); `useRunSummary` (pure derivation; `resultsTabs`
  deliberately unmemoized) and `useInheritedConfigLayer` extracted.
- **Iteration 3**: `useRepoLoad` (largest App block; same-tick guard
  ordering and probe position moved verbatim; the hook↔hook cycle
  broken by a late-bound `resolveInheritedConfig` host member);
  `RunInputs` promoted to `lib/run-inputs.ts`.
- **Termination.** Two independent assessments concur that nothing
  significant remains: the leftover clusters are either anti-criterion
  territory (the ~55-line untrusted-guard cluster), would worsen
  hook↔hook coupling (platform context, the run path — read by all
  three existing hooks), or carry load-bearing effect-ordering risk for
  marginal gain (tab/navigation). Further extraction lands on the
  research's own unsettled open question — the post-split state-sharing
  mechanism (props vs context vs store) — which is where a future item
  should start, not this one. App.tsx ended at 1,073 lines (from
  1,563); PresetTree stays as-is per "when next touched".
