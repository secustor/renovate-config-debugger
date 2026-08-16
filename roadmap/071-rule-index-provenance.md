# 071 — Rule indexes: ranges instead of snapshots, and one number per rule

Milestone: M19 · Status: in progress

## Summary

Two defects, one subject: which `packageRules` entry an index refers to.

**The answer was unusable.** `get_provenance{key: "packageRules"}` on a
`config:best-practices` run was 733 kB, because a CONCATENATED key's chain
carries each layer's cumulative snapshot of the whole merged array. The
transport's generic elider (`mcp/result.ts`) could only collapse an array of
727 large objects to its first and last element, so the tool answered "two of
727 rules" while its test asserted nothing but `truncated: true`.

**The index was ambiguous.** Renovate's validator cites `packageRules[1]` in
the config as WRITTEN; `simulate` and `get_provenance` cite the merged array.
For a config extending one preset those are 1 and 2 for the same rule — and at
`config:best-practices` scale, 1 and 714. The engine has known the mapping
since roadmap 013 (`computeRuleProvenance`'s `sourceIndex`, which the app's
`RuleMessage` already cross-links); every headless surface dropped it.

## What changed

- `packages/cli/src/projections/rule-provenance.ts` (new) — the merged array as
  one contiguous RANGE per contributing layer (ranges are exact: the engine
  builds the attribution block by block, in merge order), plus a one-line digest
  per rule carrying its merged index. Bodies are never embedded; `rule: <index>`
  returns one. Attribution unavailable ⇒ `attributionNote` and no
  `contributions`, never a guess.
- `mcp/result.ts` gains `fitsBudget` (purely additive). `get_provenance` picks
  the richest digest that survives whole — values everywhere (61 kB), then
  shape for preset ranges (47 kB), then counts (<2 kB). The authored layers keep
  their values at every level, so "your `packageRules[0]` is merged rule 713"
  survives the worst case. **The degradation is semantic, not structural.**
- `projections/provenance.ts` — a `concat` step whose `after` starts with its
  `before` reports `{addedCount, added, totalCount}` instead of two snapshots
  (falling back to the snapshots when the prefix property fails, as an
  `expandedNested` rewrite can make it).
- `simulate` (both transports) carries `ruleSources` — the same ranges, ~200
  bytes — and an inline `origin` on MATCHED rows only; annotating all 727 rows
  costs 15% of the payload to answer a question about the six that fired.
- Validator messages cross-link: `run_config`, `explain_message`, `rcd validate`
  and the simulator's own merged-array messages. Two guards, because
  `result.errors` MIXES stages: only messages emitted in the `validate` stage
  are annotated (checked against `result.events`, ambiguity ⇒ no annotation),
  and only when the run is attributable at all.
- `packages/app/src/lib/rule-cross-index.ts` (new) — the arithmetic hoisted out
  of `RuleMessage.tsx` and exported through `headless.ts`, so the CLI quotes the
  number the app renders instead of restating it.

## Non-goals

The engine is untouched — `RuleAttribution` already had everything, and the app
renders chains straight off the engine types. The elider stays payload-agnostic:
a module documented as the last resort must not start knowing about
`packageRules`. `get_final_config`, `get_resolved_config`, `get_preset_node
--body` and `simulate detail: "full"` remain legitimately elidable; they are the
declared "large body" tools, each with a named narrowing.
