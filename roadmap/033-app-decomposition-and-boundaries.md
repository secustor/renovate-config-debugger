# 033 — App decomposition + single-source boundaries

Milestone: M9 · Status: planned

## Summary

`App.tsx` is ~1,600 lines owning ~35 state/ref slots across unrelated
concerns, and the 2026-07-25 review found the predictable symptoms:
the four host tokens are quadruplicated across five places (with an
inconsistency already born from it — GitHub gets a hoisted change
handler, the other three allocate closures inline in JSX), the share
wire format exists in four places (share.ts, e2e/fixtures.ts,
share.test.ts, plus a deleted generator script fixtures.ts still cites),
and the encode-side `normalizeView` already disagrees with the
decode-side `sanitizeShareView` (`step: 0` is dropped on encode,
accepted on decode — a live round-trip bug). Storage access has zero
`try`/`catch` anywhere, and the 009 token-migration loop runs at module
scope — in a storage-disabled context it throws before `createRoot()`,
turning a degraded-app situation into a blank page — and reruns on every
load forever because keys are unversioned.

## Scope

- **Extract the host-token cluster first** (lowest risk, establishes the
  pattern): a `HOST_TOKENS` table (id, label, storage key) consumed by a
  `useHostTokens()` hook — state init, validated reads, migration,
  change handlers, and the token error rows all become one `map`; export
  the table so `run.ts` stops restating the host list.
- **Extract the share/hash/decode cluster** (~330 lines, 9 state/ref
  slots): `useShareLink` owning `shareError`, `simRequest`, the
  generation/cancellation refs, `writeHash`/`clearShareHash`,
  `loadShareToken`, the mount + hashchange effects and
  `buildShareLinkAndCopy`. The cluster carries the file's hardest
  invariants (StrictMode mount latch, decode-generation cancellation,
  self-write filtering, run-before-sim-arm ordering) — move every
  roadmap comment with the statement it annotates, and keep `onRun`
  awaited so the ordering holds by construction. This makes the protocol
  testable without mounting the whole app.
- **One share codec, one sanitizer**: encode reuses the input-schemas
  sanitizers (deleting `normalizeView`/`normalizeSim`, reconciling the
  `step: 0` rule in one place, with an encode∘decode fixpoint test);
  e2e fixtures import the real codec (keeping only deliberately-malformed
  token builders hand-written); e2e imports `ResultsTabId` instead of its
  hand-copied union; `STAGE_IDS` exported from the engine and
  `satisfies`-checked instead of restated.
- **Storage robustness**: a small `storage.ts` wrapping get/set/remove in
  try/catch (null/no-op on throw) routed through all call sites; the
  module-scope migration moved behind a `rcv.v` version marker inside a
  try, so it runs once and future migrations have a hook.

## Out of scope

- Render/memo work (032) and loading order (031) — this item is about
  code shape, not runtime cost.
- New features; every extraction must be behavior-preserving, proven by
  the untouched e2e suite.

## Dependencies

- 017/027/030 (the share/validation code being unified), 009/010 (token
  cluster), 020 (e2e as the behavior-preservation net).
