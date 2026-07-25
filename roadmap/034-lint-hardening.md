# 034 — Lint hardening (oxlint)

Milestone: M9 · Status: done

## Summary

The 2026-07-25 lint audit (oxlint 1.74.0, baseline 100% clean at
`correctness: error` / `suspicious: warn`) found the react plugin was off
entirely — and trial-enabling `react/exhaustive-deps` immediately flagged
**three genuine missing-dependency bugs**. This item applied the audit's
config against oxlint **1.75.0** (every count below was re-measured on
1.75; the rule names are the ones 1.75 actually accepts — note the hooks
rules are configured as `react/*` even though they report under a
`react-hooks(…)` code), fixed the violations it surfaced, replaced the CI
grep with a lint rule, and unlocked the type-aware tier via
`oxlint-tsgolint`.

`pnpm lint` is now `oxlint --type-aware`. It exits 0 with only the two
deliberately warn-tier rules reporting.

## What was enabled

### Hooks and JSX

| Rule                            | Setting | 1.75 count | Outcome                                      |
| ------------------------------- | ------- | ---------- | -------------------------------------------- |
| `react/react-in-jsx-scope`      | `off`   | 663        | Automatic JSX runtime — all false positives. |
| `react/rules-of-hooks`          | `error` | 0          | Clean.                                       |
| `react/exhaustive-deps`         | `error` | 3          | All three fixed (below).                     |
| `react/jsx-key`                 | `error` | 0          | Clean.                                       |
| `react/jsx-no-target-blank`     | `error` | 0          | Clean.                                       |
| `react/jsx-no-useless-fragment` | `error` | 2          | Fixed.                                       |
| `react/only-export-components`  | `error` | 12         | Fixed by moving non-component exports out.   |
| `react/no-array-index-key`      | `warn`  | 11         | Warn-tier; not fixed (future scoped work).   |

The three `exhaustive-deps` hits were real staleness, and all three are
fixed with the latest-ref pattern the files already use, so no effect
re-runs (and no loops) were introduced:

- `App.tsx` — the hashchange listener is registered once (empty deps) and
  called `loadShareToken` directly, freezing the **first render's**
  closure: a link opened later ran against that render's `onRun`, tokens
  and platform state. Now a `loadShareTokenRef` is refreshed every render
  and both share-link effects call `loadShareTokenRef.current(…)`. The
  listener is still registered exactly once.
- `App.tsx` — the same mount effect also read `oauthConfig` without
  declaring it. `oauthConfig` is a `useMemo(…, [])` over build-time env,
  so adding it to the deps array leaves the effect running exactly once.
- `RuleSimulator.tsx` — the share-link `simRequest` effect called
  `simulate`, which is redeclared every render (it closes over that
  render's `finalConfig`). Listing it in the deps would have re-run the
  effect on every render; instead a `simulateRef` is assigned during
  render (below the `!finalConfig` early return, which the effect's own
  `!result.finalConfig` guard makes unreachable when it matters) and the
  effect invokes the current closure.

### Imports and types

| Rule                                                         | Setting | 1.75 count | Outcome                                             |
| ------------------------------------------------------------ | ------- | ---------- | --------------------------------------------------- |
| `import/no-default-export`                                   | `error` | 5          | All five are tool-mandated; `overrides` allow them. |
| `import/no-unassigned-import`                                | `off`   | 2          | Side-effect CSS imports — how Vite pulls in styles. |
| `typescript/consistent-type-imports` (`inline-type-imports`) | `error` | 2          | Fixed.                                              |
| `typescript/no-import-type-side-effects`                     | `error` | 0          | Clean.                                              |
| `typescript/no-explicit-any`                                 | `error` | 3          | Three targeted disables with justification.         |
| `typescript/no-non-null-assertion`                           | `warn`  | 100        | Warn-tier; not fixed (future scoped work).          |
| `unicorn/no-array-for-each`                                  | `error` | 2          | Fixed.                                              |
| `promise/always-return`                                      | `error` | 5          | Fixed (`.then` → `await`).                          |

The five allowed default exports: `packages/app/vite.config.ts`,
`packages/app/vitest.config.ts`, `packages/engine/vitest.config.ts`,
`packages/app/playwright.config.ts`, `packages/oauth-worker/src/index.ts`.

`no-non-null-assertion` measured 101 in the audit and 100 here — the
`unicorn/no-array-for-each` fix in `shims/migration.ts` removed one.

### The `renovate/dist` boundary (replaces the CI grep)

`no-restricted-imports` is scoped by `overrides` to
`packages/engine/src/**` and `packages/app/src/**`, then turned back off
for `renovate-adapter.ts`, `shims/**` and `types/**` — exactly the house
rule, no more. The Node tests that deliberately import the real modules
live outside `src/`, which is the same scope the grep had.

Verified by trial: a `renovate/dist` import added to
`packages/engine/src/version.ts` and to `packages/app/src/share.ts` both
errored, and both stopped erroring once removed. The grep step is gone
from `.github/workflows/ci.yml`.

### Type-aware tier

`oxlint-tsgolint` is a root devDependency (catalog-pinned, all six
platform binaries in the lockfile) and `pnpm lint` runs
`oxlint --type-aware`. Real counts for the five candidates:

| Rule                                     | 1.75 count | Decision                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typescript/only-throw-error`            | 0          | **Enabled.**                                                                                                                                                                                                                                                                                      |
| `typescript/no-misused-promises`         | 2          | **Enabled**, both fixed (async handlers passed where `void` was expected — now `() => void f(…)`).                                                                                                                                                                                                |
| `typescript/no-deprecated`               | 2          | **Enabled**; `MutableRefObject` → `RefObject` fixed, `caretRangeFromPoint` disabled with justification (it is the deliberate pre-`caretPositionFromPoint` fallback).                                                                                                                              |
| `typescript/switch-exhaustiveness-check` | 1          | **Enabled** with `considerDefaultExhaustiveForUnions: true` → 0. The one hit was a switch with a deliberate catch-all `default`; the bug worth catching (a new union member falling through a switch with _no_ default) still is.                                                                 |
| `typescript/no-unnecessary-condition`    | 23         | **Deferred.** Mostly "unnecessary optional chain" on deliberate runtime guards where the _type_ is optimistic — DOM lib members that may be absent in a real browser, and JSON-shaped data typed more precisely than it arrives. Removing those guards would be a behavior change, not a cleanup. |

`--type-aware` also switches on type-aware rules from the enabled
categories that were never part of this item's scope. They are set to
`off` explicitly in `.oxlintrc.json` so the decision is visible, with
their counts here:

| Rule                                            | 1.75 count | Note                                                                           |
| ----------------------------------------------- | ---------- | ------------------------------------------------------------------------------ |
| `typescript/no-unsafe-type-assertion`           | 97         | Would be its own scoped item.                                                  |
| `typescript/no-unnecessary-type-assertion`      | 19         | Same.                                                                          |
| `typescript/no-base-to-string`                  | 9          | All `${err}`-shaped; fixing changes user-visible message text.                 |
| `typescript/consistent-return`                  | 3          |                                                                                |
| `typescript/unbound-method`                     | 1          | In the renovate JS port (`shims/renovate-deps.ts`).                            |
| `typescript/no-redundant-type-constituents`     | 1          | `LayerId \| "all"` where `LayerId = string` — the redundancy is documentation. |
| `typescript/no-unnecessary-template-expression` | 1          |                                                                                |
| `typescript/no-unnecessary-type-parameters`     | 1          |                                                                                |

## Code moved or changed

Behavior-preserving unless noted; the only intended behavior change is
the three `exhaustive-deps` staleness fixes above.

- **New modules, to satisfy `react/only-export-components`** (Fast Refresh
  only replaces modules that export components and nothing else):
  - `components/provenance-layer.ts` — `LayerId`, `layerId`,
    `layerLabel`, `layerClass` out of `ProvenanceChip.tsx`.
  - `stage-copy.ts` — `STAGE_LABELS`, `STAGE_EXPLAINERS` out of
    `StageTimeline.tsx`.
  - `glossary-data.ts` — `GlossaryEntry`, `GLOSSARY`, `TermId` out of
    `glossary.tsx` (which keeps `Term`/`Explained`).
  - `option-docs-hooks.ts` — the option-docs context, `useOptionDocs`,
    `useDiffOptionHover` and the caret hit-testing out of
    `option-docs.tsx`.
  - `components/preset-tree-stats.ts` — `computeTreeStats` and the whole
    derived-facts layer (`NodeStats`, `TreeStats`, `TreeSummary`,
    `identityForNodeId`, `nodeIdForIdentity`, `presetTreeSummary`) out of
    `PresetTree.tsx`.
  - `rule-framing.tsx` — `computeRuleFraming` simply stopped being
    exported; nothing outside the module used it.
- `run.ts`, `RuleSimulator.tsx` — `typeof import("…engine")` annotations
  became `import type * as EngineModule` declarations. Type-only, so the
  engine still arrives exclusively through the dynamic `import()`.
- `RuleMessage.tsx`, `rule-framing.tsx` — single-child fragments
  (`<>{text}</>`) return the string directly (React 19 allows it).
- `trace/provenance.ts`, `shims/migration.ts` — `forEach` → `for…of`.
- `MigrationSteps.tsx`, `rule-provenance.ts`, `EffectiveConfig.tsx`,
  `PresetTree.tsx`, `RuleSimulator.tsx` — `import().then(cb)` inside
  effects became `void (async () => { … })()`, matching App.tsx's
  existing idiom. No `catch` was added anywhere, so rejection behavior is
  unchanged.
- Three `no-explicit-any` disables, all in the renovate JS ports:
  `shims/renovate-deps.ts` (`isArray`/`isNonEmptyArray` predicates) and
  `shims/migration.ts` (`AnyConfig`). `unknown` was tried first and
  cascaded into casts at every call site of a file whose whole value is
  staying diffable against upstream.

## Rejected, recorded so the debate doesn't repeat

`no-magic-numbers` (733 hits), complexity/size thresholds (arbitrary
defaults, mostly oauth-worker + tests), `jsx-props-no-spreading`,
`filename-case` and `no-multi-comp` (all fight deliberate house
conventions), the `promise` plugin wholesale (the codebase is
async/await; only `always-return` is on, and type-aware
`no-floating-promises`/`no-misused-promises` cover the rest better).

## Out of scope

- oxfmt/style changes; anything the formatter already owns.
- Rewriting code beyond what the enabled rules require.
- The two warn-tier rules' ~110 hits, and the deferred type-aware counts
  above: each is its own scoped item when someone wants it.

## Dependencies

- None hard; landed before 031–033 so the new rules guard those
  refactors.

## Corrections (2026-07-26 audit)

The re-audit behind [038](038-lint-audit-follow-up.md) re-measured every
count above on the same oxlint 1.75.0 + oxlint-tsgolint. Most of this
document held; these four points did not, and are corrected here rather
than edited into the history above.

- **`no-base-to-string` 9 — "all `${err}`-shaped" is wrong.** Only 3 of
  the 9 are. The rest: the vendored dequal port (2), test assertions
  (2), a defensive fallback (1), and one **real latent bug** —
  `simulate-package-rules.ts` stringified an object-valued `groupName`
  (reachable from user config) into an `objectobject` slug. 038 fixes
  the bug; the rule itself stays off for the message-text reason, which
  is sound for the remaining hits.
- **"exits 0 with only the two warn-tier rules reporting" and the config
  comment's "~110 hits" are superseded.** Two
  `unicorn/consistent-function-scoping` warnings arrived with 035 and
  went unnoticed, because CI runs the warn tier but can never fail on
  it. 038 fixes them and re-baselines the tier at 124
  `no-non-null-assertion` + 11 `no-array-index-key`.
  [041](041-warn-tier-to-error.md) then removes the tier entirely.
- **`no-unnecessary-condition`'s keep-off rationale is stronger than
  documented.** Beyond the DOM-lib optimism recorded above, there is a
  second irreducible family: TypeScript cannot see an effect cleanup
  mutating a `live`/`cancelled` flag, so it narrows the flag to its
  initializer and the rule fires on the guard — on _every_ async effect
  written from here on, not just today's. That makes it a permanent tax
  rather than a backlog, which is why 038 files the rule under "never
  enable".
- **`no-unnecessary-type-parameters` (1 hit) had a good reason nobody
  wrote down.** The lone hit is in the ambient `renovate-dist.d.ts`,
  which deliberately mirrors upstream's `memCache.get<T>()` signature.
  The parameter is redundant _in isolation_ and load-bearing _as a
  mirror_ — the declaration exists to match renovate's, so it keeps it.
