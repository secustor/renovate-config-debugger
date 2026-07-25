# 032 — Keystroke render performance

Milestone: M9 · Status: done (2026-07-25)

## Summary

The 2026-07-25 review traced the editor's keystroke path: `content` lives
in App, so every keystroke re-renders App, which rebuilds the 028 panels
object and reconciles **all seven mounted tab panels** — including hidden
ones. `EffectiveConfig` (~100 provenance rows), `RuleSimulator` (full
rule list) and `MessagesPanel` were not memoized and none of them read
`content`. `PresetTree` WAS memoized, but one unstable prop (`onInject`,
recreated every render) defeated the memo on every keystroke. Measured
before the fix (jsdom harness below, `config:recommended` loaded, 20
keystrokes): OverviewTab, PresetTree, EffectiveConfig and RuleSimulator
each re-rendered **20 times** — once per keystroke. After: **0 times**,
while App itself still commits once per keystroke (20/20).

## What was done

- **Unlocked the existing memos**: `onInject` reads `injected`, so it is
  redeclared with it — it now goes through the file's latest-ref idiom
  (`selectPresetNodeRef` pattern) and hands out one stable identity;
  `installUrl()` was hoisted to a module constant (`INSTALL_URL` — it
  derives from build-time env only). This alone made `PresetTree.memo`
  hold (verified by the render counter: 20 → 0).
- **Memoized the panel construction** in App (`panels` useMemo) with
  `content` — and everything else per-keystroke — deliberately absent
  from the deps: the panels render run RESULTS, which change only on a
  run, so typing must not reconcile seven panels. Every callback prop
  that reads per-keystroke state does so through the latest-ref idiom
  (`onInject` → `injected`, `focusEditorRepoIndex` →
  `packageRuleOffsets`, `onApplyFix` → `content`/`errorLib`,
  `buildShareLinkAndCopy` → the whole share state, stabilized inside
  `use-share-link.ts`), so no memoized panel ever acts on stale state.
  The remaining handlers (`setTab`, `jumpToTab`, `onRuleFocused`,
  `onJumpToSimRule`, `onWhereFrom`) read only refs/setters and became
  plain `useCallback([])`s. `RuleSimulator`, `EffectiveConfig`,
  `MessagesPanel` and `OverviewTab` are wrapped in `memo` on top, so
  even a legitimate panels rebuild (a run, a stage click, a digest
  update) re-renders only the panels whose props changed.
- **JsonDiff**: the patch memo now depends on destructured
  `nameBefore`/`nameAfter` primitives instead of the `names` array
  literal every call site inlines, so PresetDetail's thousands-of-lines
  diffs no longer re-stringify + re-parse per parent render;
  `truncateHunks` is memoized on `[files, showAll]`.
- **Per-result caches**: `computeTreeStats` is WeakMap-cached on the
  immutable tree object — one ~1,100-node walk per result instead of
  2–4 (tree view + App badge/digest + share-link identity lookups), and
  the cache structurally enforces the 029 "badges and digest share one
  number" invariant (they now literally read one `TreeStats`).
  `computeRuleProvenance` runs once per result behind a WeakMap'd
  promise shared by its three consumers (App, EffectiveConfig, the
  simulator). The `preset-error` filter is one memo in App feeding both
  the Problems badge and the digest (MessagesPanel's own copy is
  memoized). `EffectiveConfig`'s stats passes (shown / hiddenDefaults /
  overridden) collapsed into one memoized loop.
- **Measurement harness** (`src/keystroke-render.test.tsx`, vitest
  "render" project): mounts the real App under jsdom with the shimmed
  renovate module graph (the same one the browser runs — the preset
  tree/provenance events only exist there), stubs only the CodeMirror
  editor with a textarea, runs the default `config:recommended` config
  through the real engine, then fires 20 keystrokes and counts actual
  render-function invocations per panel (memo bailouts don't count —
  the wrapper counts inside the unwrapped `memo`). It stays in the
  suite as the regression net asserting the zero-re-render invariant.

## Measured (config:recommended run loaded, 20 keystrokes)

| Panel           | before                    | after |
| --------------- | ------------------------- | ----- |
| OverviewTab     | 20                        | 0     |
| PresetTree      | 20                        | 0     |
| EffectiveConfig | 20                        | 0     |
| RuleSimulator   | 20                        | 0     |
| MessagesPanel   | (not mounted — clean run) | 0     |
| App commits     | 21                        | 20    |

## `<Activity mode="hidden">` — deferred

Re-verified both blockers against the post-032 code:

- (a) **still holds**: `EffectiveConfig` computes provenance and reports
  its stats (`onStats`) from effects inside the panel. Under Activity,
  hidden trees don't run effects, so on a fresh run the Effective badge
  and the digest's option numbers would stick on their placeholders
  until the user first opens that tab — a visible behavior change,
  which this item's constraint (render counts only) forbids. The 032
  caches don't remove this: `computeProvenance` is still owned by the
  (hidden) view.
- (b) `PresetTree`'s windowing guard assumes hidden panels mount and
  measure `clientHeight === 0`; under Activity the measuring effect
  would first run at reveal. Probably workable, but moot given (a).

And the payoff shrank: with the panels object memoized and the heavy
panels memo'd, hidden panels cost zero renders per keystroke already —
Activity would only deprioritize the one legitimate render per run.
Revisit if (a) ever moves the stats computation out of the view.

## Out of scope

- Loading order / chunking — 031.

## Dependencies

- 028 (the mounted-panels architecture this optimizes), 029 (digest/badge
  number sharing), 011 (tree windowing).
