# 041 — Promote the warn tier to error

Milestone: M10 · Status: planned (2026-07-26)

## Summary

034 left three things at warn — and the 038 audit proved warn is where
drift hides: CI runs the warn tier but can never fail on it, so 035
shipped 2 new warnings nobody saw and `no-non-null-assertion` grew
100 → 124 without a decision. User decision 2026-07-26: the warn tier
goes to **error**. After this item, `pnpm lint` reporting anything at
all fails CI — the "is the baseline actually clean?" question stops
needing an audit to answer.

Supersedes 038's softer plan for `no-non-null-assertion` (scope to
`src/**`, keep warn) — promoted to error outright instead.

## Scope

- **`react/no-array-index-key`: warn → error** (11 hits, all
  derived-list renders in `packages/app/src/components`). Fix with
  content-derived keys where the list has an identity (rule numbers,
  preset ids, message topic+text); where elements are genuinely
  positional and never reorder (static explainer rows), a justified
  inline disable states that invariant.
- **`typescript/no-non-null-assertion`: warn → error** (124 hits:
  51 engine tests, 36 e2e, 23 engine src — 17 in
  `error-translations.ts` regex-match handling — 10 app src, 4 shims/
  colocated tests). Approach:
  - src: replace with real narrowing (guards, `.at()`+checks, regex
    named-group patterns that carry the type) — the 33 src hits are the
    actual risk the audit identified.
  - tests/e2e: a tiny `must<T>(value: T | null | undefined): T` helper
    (throws with a useful message) replaces the conventional `!` — an
    assertion that FAILS THE TEST with context instead of throwing a
    bare TypeError. Mechanical, and it reads better in a spec anyway.
  - No blanket overrides: the audit showed all 24 post-034 additions
    were test/e2e — the convention spreads wherever it's allowed.
- **`categories.suspicious`: warn → error.** Standing debt is the 2
  `unicorn/consistent-function-scoping` hits 038 already fixes, so the
  promotion itself is near-free. Accepted consequence, stated
  deliberately: an oxlint upgrade that adds rules to the category can
  now fail CI — that is the point (new-rule fallout gets a decision at
  upgrade time instead of accumulating silently). oxlint is
  catalog-pinned, so upgrades are explicit renovate PRs where that
  decision belongs.
- `.oxlintrc.json` comments and 034's "warn tier" prose get a pointer
  here so the history stays coherent.

## Ordering

038 first (its fixes shrink this item's list and its 034 corrections
land the doc groundwork), then this item. 040 is independent but
shares files with the `no-array-index-key` fixes — coordinate to avoid
conflicts if run concurrently.

## Out of scope

- The still-off type-aware rules (`no-unsafe-type-assertion`,
  `no-unnecessary-type-assertion`, …) — 038 records them as their own
  future items; this item only promotes what already reports.
- `--deny-warnings` in CI: unnecessary once nothing is configured at
  warn, and it would break the deliberate advisory tier if one is ever
  reintroduced.

## Dependencies

- 038 (quick wins + audit corrections land first), 034 (the config
  this hardens).
