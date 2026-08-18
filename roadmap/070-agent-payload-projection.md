# 070 — Agent payload projection: ask precisely, get a small answer

Milestone: M19 · Status: in progress

## Summary

The headless surface answers three questions with a config document —
`get_final_config` / `rcd run --select final`, `simulate`'s
`finalDependencyConfig`, and `compare_simulations`' key delta — and until now
it answered all three with everything it had. Measured on the CLI, compact
JSON:

| payload                                               | total   | `rawFinalConfig` | `mergeSteps` | `finalDependencyConfig` |
| ----------------------------------------------------- | ------- | ---------------- | ------------ | ----------------------- |
| `simulate` on `test/fixtures/mixed-rules.json`        | 106 KB  | 26 KB            | 52 KB        | 24.8 KB / 396 keys      |
| `simulate` on `config:recommended` + a react update   | 1.39 MB | 199 KB           | 797 KB       | 26.8 KB / 396 keys      |
| `simulate` on `config:best-practices` + `@babel/core` | 2.99 MB | 203 KB           | 2.44 MB      | 27.6 KB / 395 keys      |

Three facts shaped the fix:

1. **107 of those 396 keys are `globalOnly`** — options read from a self-hosted
   global config, which no matcher can read and no rule can write. In a
   PER-DEPENDENCY config they are provably inert. Dropping them is 27% of the
   keys but only 12% of the bytes: it is a legibility win, not a byte win.
2. **`keys` is the byte lever.** The same fixture asked for three named options
   is 2.9 KB.
3. **The CLI was the worse offender than MCP.** `rcd simulate --format json`
   spread the whole `SimulationResult`, so the merge trace was 74% of its
   payload — the `detail` gate existed only on the MCP side. Consistency here
   is not a nicety; it is most of the fix.

And one defect underneath all three: `description` is a `mergeable` array, so
`mergeChildConfig` concatenates it on nearly every merge, and every merged diff
re-embedded the whole array on BOTH sides. At `config:best-practices` scale one
rule's `description` entry is 4,084 bytes; the collapsed form is 145.

## User story

As an agent debugging one option of one dependency, I want to ask for that
option and get an answer about it, so that the tool's reply fits in the context
I have and I can tell what it did not tell me.

## The design: four orthogonal axes, one vocabulary on both transports

| axis                 | parameter                 | selects                   | default                  |
| -------------------- | ------------------------- | ------------------------- | ------------------------ |
| `detail`             | `verdict` \| `full`       | which top-level members   | `verdict`, both surfaces |
| `configScope`        | `package-rules` \| `full` | which CLASS of config key | per tool, below          |
| `keys`               | `string[]`                | which NAMED config keys   | all                      |
| `verdict` / `source` | existing                  | which rules               | existing                 |

Two shared projection modules under `packages/cli/src/projections/`, following
the `tree.ts` / `messages.ts` pattern — pure functions, no io, used by the CLI's
`--format json` and by the MCP server so the two transports are one
implementation:

- **`config-view.ts`** — `projectConfig(config, {keys, scope})`, plus the
  `description` collapse (`collapseDiffs`/`collapseDeltas`, `deltaLine`,
  `mergedLine` — the comparison delta names its sides `a`/`b`, a merge names
  them `before`/`after`, and one predicate serves both).
- **`simulate.ts`** — `SIMULATE_DETAIL`, `VERDICT_DETAIL_NOTE`,
  `simulationPayload` (moved out of `mcp/server.ts`) and `comparisonPayload`.

The engine keeps one definition of the `globalOnly` class:
`packages/engine/src/config-scope.ts` (hoisted out of `pipeline.ts`) exports
`removeGlobalConfig` — which the pipeline already used for the inherited layer
— and a cached `globalOnlyOptionNames()`. `execute()`, `diffKeys`,
`SimulationResult` and every golden↔shimmed snapshot are untouched: all of this
is presentation.

### Decision 1 — `keys` is additive-filter-only

`keys` applies AFTER the scope prune, so it can only ever narrow. Asking for a
`globalOnly` option under the default `simulate` scope returns nothing and
reports `withheld: [{key, reason: "global-only"}]`; widening is
`configScope: "full"`'s job alone, because one parameter that both narrows and
widens is a parameter nobody can predict.

`absent` and `global-only` are kept apart deliberately: "this document has no
such option" and "this view cannot carry it" are different answers, and a
silently empty result is indistinguishable from a bug.

The invariant that buys: **every answer is a subset of the default answer**,
for any combination of the four axes. That is what makes them composable, and
what lets an agent reason about what it did not get.

### Decision 2 — the same vocabulary, a different default per tool

- `simulate.finalDependencyConfig` and `compare_simulations`' delta default to
  `package-rules`. The document is by construction "what `applyPackageRules`
  produced for one dependency"; the globalOnly class cannot participate.
- `get_final_config` and `rcd run --select final` default to `full`. This is
  the run's whole effective config — the surface someone debugs a self-hosted
  `globalConfig`/`inheritedConfig` layer on, where those options ARE the
  answer. Pruning them by default would be wrong for the tool's own question.

Each answer states which view produced it (`configView.scope`,
`droppedGlobalOnly`, `withheld`), so nobody has to infer it.

### Decision 3 — collapse `description`, and only `description`

The conditions are narrow: the key is `description`, both sides are string
arrays, `before` is non-empty, and `after` starts with `before` — precisely what
array concatenation guarantees. A rule that REPLACED the description still
shows both sides; `labels` and `extends` stay verbatim, because a reader of a
`labels` diff wants the list. This is 069's direction (attribute the
contribution, never drop the key): the collapsed entry names the sentences this
step added and states the length of the array they joined, and the full array
is one `get_provenance description` away.

## Scope

- `packages/engine/src/config-scope.ts` (new) + the `index.ts` exports.
- `packages/cli/src/projections/config-view.ts`, `projections/simulate.ts` (new,
  with unit tests including the monotonicity invariant).
- `rcd simulate` gains `--detail`, `--keys`, `--config-scope`; `rcd compare` and
  `rcd run` gain `--keys` and `--config-scope`; `args.ts` carries the entries.
- MCP `simulate`, `compare_simulations`, `get_final_config` gain `keys` and
  `configScope`; the size hints name `keys`.
- `packages/cli/README.md`.

Out of scope: the app (it consumes `SimulationResult` directly and has its own
UI affordances for size), `mcp/result.ts` (the byte budget stays a transport
safety net — the reduction happens at construction), and dot-path keys.

## Risks

- **A published output shape changes.** `rcd simulate --format json` no longer
  carries `mergeSteps`/`rawFinalConfig` by default and prunes the globalOnly
  class from `finalDependencyConfig`. Mitigated by `--detail full` (byte-exact,
  and covered by a test that asserts identity, not equality), by
  `--config-scope full`, by the `detailNote` in the payload naming the flag,
  and by the package being pre-1.0 and flagged experimental.
- **`keys` does not touch `rules`.** An unfiltered `config:recommended`
  `simulate` is still ~346 KB, because the rule list dominates at that scale,
  and it will still elide. That is `verdict`/`source` territory; whether
  `verdict: "notable"` should become the MCP default is a separate decision on
  a separate axis.
