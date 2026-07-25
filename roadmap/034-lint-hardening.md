# 034 — Lint hardening (oxlint)

Milestone: M9 · Status: planned

## Summary

The 2026-07-25 lint audit (oxlint 1.74.0, current baseline 100% clean at
`correctness: error` / `suspicious: warn`) found the react plugin is off
entirely — and trial-enabling `react/exhaustive-deps` immediately flags
**three genuine missing-dependency bugs** (`RuleSimulator.tsx:943`,
`App.tsx:886`, `App.tsx:922`). The audit produced a ready-to-apply
config; this item applies it, fixes the violations it surfaces, and
unlocks the type-aware tier.

## Scope

- **Enable now** (0–5 violations each, all triaged): `react/rules-of-hooks`,
  `react/exhaustive-deps` (fix the three real hits), `react/jsx-key`,
  `react/jsx-no-target-blank`, `import/no-default-export` (overrides for
  the five tool-mandated default exports: vite/vitest/playwright configs,
  oauth-worker entry), `typescript/consistent-type-imports` (inline
  style, 2 fixes), `typescript/no-import-type-side-effects`. Explicitly
  disable `react/react-in-jsx-scope` (automatic JSX runtime — 663 false
  positives otherwise).
- **Replace the CI grep**: the hand-rolled `renovate/dist` import-boundary
  check in ci.yml becomes `no-restricted-imports` with overrides for
  `renovate-adapter.ts`, `shims/**`, `types/**` — same guarantee, but
  IDE-visible and not shell-fragile.
- **Unlock type-aware rules**: add `oxlint-tsgolint` as a devDependency
  and evaluate `typescript/no-misused-promises`,
  `no-unnecessary-condition`, `no-deprecated`, `only-throw-error`,
  `switch-exhaustiveness-check` at real violation counts (they silently
  cannot run at all today — a bare CLI trial reports 0 and means
  nothing).
- **Cleanup-tier passes**, each a deliberate small PR, not a config flip:
  `react/only-export-components` (12 hits — Fast Refresh breakage, move
  non-component exports out), `unicorn/no-array-for-each` (2),
  `react/jsx-no-useless-fragment` (2), `promise/always-return` (5),
  `typescript/no-explicit-any` (3, all in third-party shim adapters).
  `typescript/no-non-null-assertion` (101, half in tests) and
  `react/no-array-index-key` (11) start at `warn`, scoped decisions
  recorded here when made.
- **Rejected, recorded so the debate doesn't repeat**: `no-magic-numbers`
  (733 hits), complexity/size thresholds (arbitrary defaults, mostly
  oauth-worker + tests), `jsx-props-no-spreading`, `filename-case` and
  `no-multi-comp` (all fight deliberate house conventions), the
  `promise` plugin wholesale (codebase is async/await; type-aware
  `no-floating-promises`/`no-misused-promises` cover it better).

## Out of scope

- oxfmt/style changes; anything the formatter already owns.
- Rewriting code beyond what the enabled rules require.

## Dependencies

- None hard; lands best before 031–033 so the new rules guard those
  refactors.
