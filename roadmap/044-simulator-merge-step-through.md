# 044 — Simulator: step through rule merges one at a time

Milestone: M12 · Status: planned

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
