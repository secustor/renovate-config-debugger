# 044 — Simulator: step through rule merges one at a time

Milestone: M12 · Status: done (2026-07-26)

## Summary

The simulator (006/012) answers "which rules match and what config falls
out", but the middle — HOW the final per-dependency config accumulated —
is only visible as per-rule changed-key chips (`SimMergedApplied`). When
several rules touch the same key, the order of wins is exactly the thing
the user is debugging, and today they reconstruct it in their head. The
migration stepper (004) already solved this interaction for the migrate
stage: Step N of M, Prev/Next, a per-step diff, a cumulative toggle.
Give the simulator the same step-through over its merge sequence.

## Scope

- **Engine: per-merge before/after snapshots.** `simulatePackageRules`
  already merges matching rules sequentially (`mergeChildConfig` per
  rule, then the upstream `flattenUpdates` replication) and records
  `merged: MergedKey[]` per rule via `diffKeys`. Record the full config
  snapshot before/after each MATCHING rule's merge as well — the same
  event shape the migration steps carry, which is what makes both the
  per-step and the cumulative diff derivable. The update-type flattening
  step becomes the final synthetic step whenever it merged something
  (it already reports its keys in a note). Configs here are small;
  snapshot cost is negligible.
- **App: the stepper, in the 004 grammar.** A step-through under the
  simulator's final-config section stepping over matching rules only —
  non-matching rules already explain themselves clause-by-clause in the
  rule list and have no merge effect to show. Each step names the rule
  (its 013 identity/provenance chip), shows its `JsonDiff`
  (before → after this rule), and the cumulative toggle diffs from the
  pre-rules base config instead. Reuse the `MigrationSteps` interaction
  metrics verbatim; decide at implementation whether the component
  itself generalizes cleanly or the simulator gets a sibling — do NOT
  fork the CSS (one `.migration-steps` grammar, roadmap 042's insets
  included).
- **Share links record the step.** 007/017 links already restore the
  migration step; the simulator step gets the same treatment (optional
  field, decode-side tolerant, absent = step 0) so a shared link can
  point at "look at what THIS rule does".

## Out of scope

- A/B compare mode (021): the stepper appears for the single-result
  view first; making two steppers stay in lockstep across A/B panes is
  its own interaction problem and ships separately if wanted.
- Stepping through NON-matching rules — the clause table already tells
  that story, and steps with empty diffs would bury the signal.
- Any change to match/merge semantics — this item only records and
  replays what the existing simulation already does.

## Dependencies

- 004 (the stepper interaction this reuses), 006/012 (the simulator and
  its verdict-first results), 013 (rule identity for step titles), 007/
  017 (share-link view state), 042 (the stepper's card inset grammar).

## What was done

- **Engine: `result.mergeSteps: MergeStep[]`** (a new top-level array, not
  fields on `RuleEvaluation`). Each entry carries
  `kind: "rule" | "flatten"`, the `ruleIndex` (rule steps) or `updateType`
  (the flatten step), FULL `before`/`after` config snapshots
  (`structuredClone`, with a JSON round-trip fallback so a snapshot can
  never take a simulation down), and the same `merged: MergedKey[]` array
  the rest of the result already reports for that merge. A top-level
  sequence was chosen over per-rule snapshot fields because the flattening
  step is not a rule and has to sit in the SAME ordered list the stepper
  walks; it also keeps the majority (non-matching) `RuleEvaluation`s
  unchanged in size and shape. Nothing else moved: `rawFinalConfig`,
  `finalDependencyConfig`, `flattened` and every clause/verdict field are
  byte-identical, so the 006 oracle-parity tests still compare the same
  values.
- **The sequence is contiguous by construction.** `mergeSteps[i].after`
  equals `mergeSteps[i + 1].before`, and `mergeSteps[0].before` is the
  pre-rules base (upstream's `PackageRuleInputConfig`) — which is what
  makes the per-step diff AND the cumulative diff exact without recomputing
  anything. Two consequences of that choice, both deliberate: the rule
  snapshot is taken BEFORE `mergeChildConfig` runs (`before` and `config`
  share nested objects, so an after-the-fact snapshot could not be trusted),
  and the flatten step's `before` keeps the update-type blocks, so its diff
  shows both halves of what `flattenUpdates` does — the block merged up, and
  every update-type block then dropped. `merged` still names only what the
  block merged up, matching `flattened.merged`.
- **A matching rule that changed nothing still gets a step.** "This rule
  matched and set nothing" is an answer the stepper has to be able to give
  (the e2e fixture hits it for real: a rule setting `automerge: false` over
  the default `false` changes nothing), and it keeps the step count equal to
  the matched-rule count the verdict block reports. Non-matching rules get
  no step, per Out of scope.
- **`components/StepThrough.tsx`** — the 004 interaction, extracted rather
  than forked: counter, Prev/Next/Jump to end, the keyed `JsonDiff` and the
  Cumulative toggle, controlled-or-uncontrolled index, `compact` variant.
  It renders the `.migration-steps` class family unchanged, so there is
  exactly one stepper grammar in the app and zero new stepper CSS.
  `MigrationSteps` is now a thin migrate-stage adapter over it (it names the
  steps, keeps `CodeText` for the backtick explanations and owns "Copy
  migrated config"); its own props, DOM and callers are unchanged, so 042's
  `.card > .migration-steps > …` insets and the compact preset-row stepper
  behave exactly as before.
- **`SimMergeSteps` in `RuleSimulator.tsx`**, rendered by `SimFinal` between
  the "Rules changed" line and the resolved-config disclosure. Each rule
  step's head is the rule's 013 identity — `packageRules[N]`, the same
  clause label `ruleLabel` gives a rule row, and the provenance chip
  (clickable through to the contributing preset) — and its explanation names
  the keys that merge changed; the flatten step is titled "Update-type
  flattening" with the update type as its key chip. Cumulative diffs are
  labelled `before any rule → after this step`. Verified that 042's insets
  do NOT reach it: they are scoped to `.card > .migration-steps`, and this
  stepper sits inside `.sim-results` (which already brings the card's
  0.75rem inset) → `.sim-results-body` → `.sim-final`. The only new CSS is
  two spacing rules on the `.sim-merge-steps` wrapper.
- **Hidden when there is nothing to step through** — i.e. when
  `mergeSteps` is empty. With no matching rule that is the "0 rules matched"
  case the item asks for; the one refinement is that a run where no rule
  matched but an update-type block still flattened shows that single real
  merge instead of nothing.
- **A/B compare (021) stays out.** The stepper is rendered by `SimFinal`,
  which belongs to the single-result block; `ComparisonPanel` (the only A/B
  surface, an additive panel above it) renders no stepper and was not
  touched. No lockstep problem is created.
- **Share links: `view.simStep`.** Additive within v2 exactly like 028's
  `tab` — same `stepIndexSchema` (nonnegative integer) in
  `sanitizeShareView`, dropped on its own if malformed, absent = step 0.
  Encoded only when > 0: unlike `step`, nothing infers a tab from it (028's
  `legacyTabForView` predates it, and every link that can carry it also
  carries an explicit `tab`), so old links keep decoding unchanged and links
  that never touched the stepper do not grow. App owns the index
  (`mergeStepIndex`) exactly as it owns `migrationStepIndex`: reset on a new
  pipeline result, reset by the simulator on a new simulation — except for
  the share-link auto-run, which passes `keepStep` so the index the link
  just restored survives the simulation it triggers.
- **032 keystroke invariant** — the two new props are a number and a
  `useState` setter (identity-stable), threaded through
  `ResultsColumnProps` and the `panels` memo the same way
  `migrationStepIndex`/`onMigrationStepChange` are. Measured: still 0 panel
  re-renders over 20 keystrokes.
- Verification: `pnpm lint` (silent), `pnpm -r typecheck`, `pnpm format` +
  `format:check`, engine `test:shimmed` (90 tests — 2 new asserting the
  per-rule snapshots, the flatten step, contiguity, and the empty/no-match
  cases) and `test:golden` (61, unchanged), app `test:unit` (189 — 3 new
  across `share.test.ts` and `input-schemas.test.ts`, keystroke invariant at
  0), `build`, and all 50 e2e tests (1 new: two matching rules, step
  forward, the counter and the diff both change, cumulative re-frames it,
  and the stepper disappears for a dependency nothing matches).
