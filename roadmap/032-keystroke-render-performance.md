# 032 — Keystroke render performance

Milestone: M9 · Status: planned

## Summary

The 2026-07-25 review traced the editor's keystroke path: `content` lives
in App, so every keystroke re-renders App, which rebuilds the 028 panels
object and reconciles **all seven mounted tab panels** — including hidden
ones. `EffectiveConfig` (~100 provenance rows), `RuleSimulator` (full
rule list) and `MessagesPanel` are not memoized and none of them read
`content`. `PresetTree` IS memoized, but one unstable prop (`onInject`,
recreated every render) defeats the memo on every keystroke. `JsonDiff`'s
patch memo depends on an inline `names` array literal at every call site,
so diffs documented as "thousands of lines" re-stringify + re-parse on
every render — including both PresetDetail diffs while typing. Several
heavy pure computations also run redundantly per result: `computeTreeStats`
walks the 1,100-node tree 2–4×, `computeRuleProvenance` runs 3× (one per
mounted consumer), `MessagesPanel` re-filters ~1,000 events unmemoized,
and `EffectiveConfig` makes 3–4 passes over its entries.

## Scope

- **Unlock the existing memos** (small, do first): stabilize `onInject`
  with the file's own latest-ref idiom (`selectPresetNodeRef` pattern);
  hoist `installUrl()`. This alone makes `PresetTree.memo` work.
- **Memoize the panel construction** in App with `content` deliberately
  absent from the deps; wrap `RuleSimulator`, `EffectiveConfig`,
  `MessagesPanel`, `OverviewTab` in `memo` and stabilize their callback
  props (`onStats`, `onRuleFocused`, `onCopySimLink`).
- **JsonDiff**: primitive deps (`nameBefore`/`nameAfter` destructured)
  instead of the `names` array; memoize `truncateHunks`.
- **Per-result caches**: `WeakMap`-cache `computeTreeStats` keyed on the
  immutable tree (this also structurally enforces the "badges and digest
  share one number" invariant that 029 currently upholds by re-running
  the same function); a shared cache or single provider for
  `computeRuleProvenance`; hoist the `preset-error` filter to one memo in
  App; collapse `EffectiveConfig`'s passes into one memoized loop that
  yields shown/hiddenDefaults/overridden together (also removes the
  render-time work that blocks the `Activity` follow-up below).
- **Follow-up (evaluate, don't assume)**: `<Activity mode="hidden">` for
  inactive panels — React 19.2 has it; it would deprioritize hidden
  renders while preserving exactly the state 028 keeps panels mounted
  for. Two verified blockers first: `EffectiveConfig` reports its stats
  from a `useEffect` (would not run hidden → the digest sticks on its
  placeholder), and `PresetTree`'s windowing comment assumes the current
  reveal timing. Only adopt with both re-verified.

## Out of scope

- Loading order / chunking — 031.
- Any behavior change; this item is measurable purely as render counts
  (React DevTools profile before/after on a `config:recommended` run
  while typing).

## Dependencies

- 028 (the mounted-panels architecture this optimizes), 029 (digest/badge
  number sharing), 011 (tree windowing).
