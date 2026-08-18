# 073 — Focused by default: the narrowest useful answer, and a map of the rest

Milestone: M19 · Status: in progress

## Summary

The headless surface's default answer to "would this update match the rules?"
did not fit the transport budget — so it was **already incomplete, by accident**.
A `simulate` call on a `config:recommended` config produced 347 KB against a
~65 KB tool-result cap, and `mcp/result.ts` elided the `rules` array
structurally: the agent got a first/last window chosen by byte arithmetic, with
no relation to what it asked. The choice was never between a complete answer and
a narrowed one. It was between **arbitrary** incompleteness and **deliberate**
incompleteness that hands back a map.

This layer makes the narrowest useful answer the default on every surface, and
gives everything it withholds a name.

## Where the bytes were

Same call — `config:recommended` + a react major, Renovate 44.7.4 — with the
rules bucketed by what each contributes (compact JSON):

| slice of the answer                     | rows | bytes   | what it tells you                                            |
| --------------------------------------- | ---- | ------- | ------------------------------------------------------------ |
| Answer tier (everything except `rules`) | —    | 4,297   | verdict sentence, dep, `flattened`, aggregates, notes        |
| Matched rules, with clause evidence     | 3    | 2,550   | the citable "why" — what fired, on which field, what it set  |
| Rules that failed only on unset input   | 447  | 229,446 | nothing actionable per row; `missingInputs` says it in 861 B |
| Genuine mismatches                      | 264  | 111,104 | "these rules don't apply to this dependency"                 |
| Rules whose matcher threw               | 0    | 2       | must never be hidden — see the blocker below                 |

Two thirds of the payload is the no-input bucket, whose decision-relevant
content roadmap 072's stack had already compressed 267× into an aggregate that
travels unconditionally. That is the shape of this whole change: **counts and
reasons stay, bodies go.**

Those buckets sum to the answer tier plus the rules array: **347,395 B → 6,847 B**
after the flip. Re-measured on the persona replay's `scenario-44006` config
(`config:recommended` plus one repo rule) with `rcd simulate --format json`, the
whole payload — `finalDependencyConfig` included, which the buckets above leave
out — is **369,099 B at `--verdict all` and 31,172 B at the new default**,
compact: 11.8× smaller, un-elided, and 2,550 of the surviving bytes are the rule
rows. The remaining bulk is the per-dependency config (23,902 B / 289 effective
options at `configScope: "package-rules"`), which `keys` narrows — see "What this
did not do".

## Three tiers, two invariants

- **Answer** — always present, always small, never elided: the verdict sentence,
  the counts, and any aggregate that could change a conclusion (`missingInputs`,
  `evaluationErrors`, would-refuse, "a migration rewrote your config").
- **Evidence** — default-on but scoped to what acted: the rules that matched or
  could not be decided, with clause-level evidence and `origin`; the behavioral
  deltas; the options the rules changed.
- **Bulk** — opt-in by name: every rule row (`verdict: "all"`), `mergeSteps` and
  `rawFinalConfig` (`detail: "full"`), whole config documents, preset bodies.

What makes tier 3 safe to drop:

1. **No silent narrowing.** Every omission is announced in tier 1 with a count,
   a reason, and the exact parameter that reverses it. A key that simply
   vanishes is indistinguishable from a bug.
2. **Conclusion-preserving.** A narrowing is permitted only once the aggregates
   covering everything it hides are unconditional. That is a testable gate, and
   it is exactly why the missing-input summary had to land before this change
   rather than after.

## The blocker: `notable` hid evaluation errors

Found while checking invariant 2, and fixed first, alone, because it is a
correctness bug rather than a payload one.

A clause whose matcher throws is recorded `state: "error"` and pushes its rule
to `verdict: "no-match"` (`simulate-package-rules.ts`, the `catch` in
`evaluateRule`) — while `notable` was defined as `verdict !== "no-match"`. So
the documented honest-error case — `matchCurrentVersion` on a `conda`
dependency, whose ~3 MB WASM versioning module the browser build deliberately
excludes — would have vanished from a focused default. "The tool could not
evaluate this rule" is the last thing that may go missing.

The fix has three parts:

- `hasEvaluationError(rule)` and `summarizeEvaluationErrors(rules)` in
  `packages/engine/src/simulate-missing-inputs.ts` — which is now explicitly the
  module for the aggregates that must survive filtering, projection and elision.
  `SimulationResult.evaluationErrors` is required, computed after the rule loop
  exactly as `missingInputs` is; its `note` states that the result may not
  reflect a real Renovate run.
- `notable` becomes `verdict !== "no-match" || hasEvaluationError(rule)`, and
  `no-match` keeps meaning a GENUINE mismatch — it now excludes error rows the
  way it already excluded no-input ones.
- A new `error` member of the verdict vocabulary, end to end: `VerdictFilter`,
  `matchesVerdictFilter`, `verdictFilterOptions` (so the app's drawer gets the
  facet with its count), the MCP `RULE_VERDICT` enum, `--verdict`'s help text
  and the `facetText` spellings.

`execute()` is untouched. Widening `notable` is a FILTER change, not a verdict
change: the oracle parity against upstream `applyPackageRules` is what the
golden↔shimmed suite proves, and it still holds byte for byte.

## The defaults that changed

| surface                                        | today                                            | new default                                          | drill-down                                           |
| ---------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------- |
| `simulate` (MCP)                               | all ~714 rows, elided by the transport           | `verdict: "notable"` (+ error rows)                  | `verdict: all\|no-match\|no-input\|error`, `rule: N` |
| `rcd simulate --format json`                   | `all`                                            | `notable` — one default for pretty, JSON and MCP     | `--verdict all`, `--rule N`                          |
| `simulate` `source`                            | all                                              | **keep** `all`                                       | narrowing it would change conclusions                |
| `simulate` `detail`                            | `verdict`                                        | **keep** — `mergeSteps`/`rawFinalConfig` stay opt-in | `detail: "full"`                                     |
| `compare_simulations`                          | whole comparison, `matchedInBoth` + signatures   | new `detail` axis, default `verdict`                 | `detail: "rules"\|"full"`, `--detail`                |
| `get_final_config`                             | full document, elided when over budget           | full when it fits; over budget, a **key index**      | `keys: [...]`, `configScope`                         |
| `run_config`, `get_preset_*`, `get_provenance` | summary + handle, depth-limited, stats-then-body | **keep** — these were already the model              | unchanged                                            |

### Why flipping `--format json` is safe for scripts

`matched ⊂ notable`, so the common pipeline —
`rcd simulate --format json | jq '.rules[] | select(.verdict=="matched")'` —
returns exactly what it did before. The only queries affected are the ones
asking for rows that did NOT match, which is the rare and explicit case. A
default should preserve the common query and cost a flag on the rare one.
Flipping JSON as well also keeps pretty output, JSON output and MCP giving one
answer to one question — the defect this stack already fixed once, where the
CLI's text renderer and its own JSON disagreed about which rules "only matched
in A".

### Completing the fetch surface: `rule: N`

Focus is only safe if every hidden thing has a name, and the audit found exactly
one gap: "why did THIS rule not fire" had no fetch. `simulate` gains `rule`
(MCP) / `--rule <n>` (CLI): one merged rule's whole row, no elision, plus its
`origin` — which the list omits on non-matched rows because annotating ~727 rows
costs 15% of the payload, and which one row can afford. It is deliberately
independent of `verdict`/`source`: a row the filter hides is the commonest
reason to ask. It is also what finally makes `missingInputs.sampleRuleIndexes`
actionable — that field had been handing out indexes with nothing to inspect
them with.

The drill-down reports the facets as `all` in `ruleFilter`, because none of them
produced the list; saying `verdict: "notable"` about a row `notable` hides would
be a claim the answer cannot back.

### `compare_simulations`' own detail axis

At the default `verdict` level the comparison drops the two things that cost:
`matchedInBoth` (every rule that behaved the same on both sides — the answer to
a question nobody asks of a diff) and the per-rule `signature` strings, each a
whole selector array re-serialized next to the `label` that already names the
rule. The identity axis becomes
`identity: { changed, counts: { onlyInA, onlyInB, signatureChanges } }`, and the
note names `detail: "rules"`. `rules` restores the arrays; `full` is the
engine's `SimulationComparison` exactly as computed. The projection lives in
`comparisonPayload` — `packages/engine/src/simulate-compare.ts` stays complete.

Pretty output follows the same axis rather than having its own: at the default it
prints "Selector text changed on N rules … `--detail rules` lists them", because
a fact that disappears with a detail level reads as a bug.

### `get_final_config`'s key index

The run's effective config is ~200 KB on a `config:recommended` run. The generic
elider's answer was a `packageRules` cut to first-and-last inside a document
that still looked whole — neither the config nor a description of it. When the
projected document does not fit (`fitsBudget`), the tool now answers with
`{ configIndex: [{ key, bytes }], keys, configView, note }`: every top-level
option, the bytes its value costs, biggest first, and a note naming
`keys: [...]` and `configScope`. An index is honest at any size. A document that
fits is still returned whole.

## One notes array

The simulate payload had grown five note-shaped fields — `notes`, `detailNote`,
`missingInputsNote`, `ruleSourcesNote` and `flattened.note`. An agent should not
have to learn five field names to find the map. Each aggregate keeps its own
`note` inside its object (`missingInputs.note`, `evaluationErrors.note`,
`flattened.note`); everything that is a pointer about the ANSWER is appended to
the single top-level `notes: string[]`, in the order a reader needs it — the
evaluation-error pointer ahead of the missing-input one, because "the tool could
not evaluate this" outranks "your dep left a field unset". `compare` answers the
same way.

## The acceptance criteria, as tests

Invariants over the tool surface, not examples — they are what stops the next
payload from silently regrowing. All four live in
`packages/cli/src/mcp/server.test.ts` (`describe("focused by default")`), with
CLI-side twins in `commands/simulate.test.ts`:

1. **Un-elided default.** On a `config:best-practices` run, every tool's DEFAULT
   answer comes back with `truncated` undefined — plus a companion test proving
   the named bulk surfaces (`detail: "full"`, `get_preset_node --body`) still do
   truncate, so the first test cannot pass by the elision having quietly stopped
   working.
2. **Reversibility.** For every narrowing, the default payload carries both a
   count of what was withheld and the literal parameter that returns it.
3. **Conclusion-preserving.** On the group-preset config with a dependency
   lacking `sourceUrl`, the default answer still reports `missingInputs`; on a
   config whose matcher throws (the real `conda` case, as
   `test/fixtures/conda-version.json`), the default answer still contains the
   error row AND `evaluationErrors`.
4. **Round-trip.** `rule: N` returns the row `verdict: "all"` shows at index N —
   asserted over the indexes `missingInputs.sampleRuleIndexes` hands out.

## Scope

- `packages/engine/src/simulate-missing-inputs.ts` — `hasEvaluationError`,
  `summarizeEvaluationErrors`, `EvaluationErrorSummary`; `simulate-package-rules.ts`
  gains the required `evaluationErrors` member; `index.ts` exports.
- `packages/app/src/lib/rule-filters.ts` — the widened `notable`, the `error`
  facet, its count; `rule-verdict.ts` + `headless.ts` re-export the predicate.
- `packages/cli/src/rule-view.ts` — one default for every format, the `rule`
  selection, `ruleFilterNote`, `evaluationErrorsNote`, `ruleFilter` on every
  payload (`explicit` is gone with the old two-defaults rule).
- `packages/cli/src/projections/simulate.ts` — `ruleRows` (one implementation of
  a rule row for both transports), the consolidated `notes`, `COMPARE_DETAIL` +
  the comparison projection; `projections/config-view.ts` — `configKeyIndex`.
- `packages/cli/src/commands/simulate.ts`, `commands/compare.ts`, `args.ts`,
  `mcp/server.ts`; `packages/cli/README.md`.

## What this did not do

`finalDependencyConfig` is 23,902 B of the flipped default (289 effective
options after `configScope: "package-rules"` drops the 107 globalOnly ones), so
the focused payload measures 31,172 B compact rather than the 6,847 B the
rules-and-answer tiers alone account for. It still fits the budget un-elided,
which is what invariant 1 asks of it, and `keys: [...]` takes the same call to
11,408 B pretty / far less compact. Making the effective-config document itself
tiered — "the options the rules changed" by default, the whole document on
request — is a separate decision about what a simulation's answer IS, and
belongs with the verdict work rather than in a payload layer.
