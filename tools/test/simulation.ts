/**
 * The hand-written `SimulationResult` a simulator suite asserts over, plus the
 * two micro-builders (`ruleEval`, `clauseEval`) and the `MergeStop` chrome the
 * derivations carry but never read.
 *
 * Seven suites across `lib/` and `features/simulator/` used to spell the same
 * ten-field skeleton out, and four more re-declared the rule/clause builders
 * with three drifted signatures — so adding a field to the engine's type meant
 * patching every copy. Same bill `repo-deps.ts` exists to stop paying.
 *
 * Under `tools/test` like the other harnesses: a fixture two feature slices
 * share has no home inside either of them, and test scaffolding can never ride
 * into the production build.
 */
import type {
  ClauseEvaluation,
  MergedKey,
  RuleEvaluation,
  SimulationResult,
} from "@renovate-config-debugger/engine";
import type { MergeStop } from "@/features/simulator/merge-stops";

/** An empty simulation — nothing matched, nothing merged — with every field
 *  the engine really returns. Override the ones a test is about. */
export function simResult(overrides: Partial<SimulationResult> = {}): SimulationResult {
  return {
    rules: [],
    rawFinalConfig: {},
    finalDependencyConfig: {},
    flattened: { merged: [], blocks: {}, authoredBlocks: [] },
    missingInputs: { rules: 0, groups: [] },
    evaluationErrors: { rules: 0, selectors: [], messages: [], sampleRuleIndexes: [] },
    mergeSteps: [],
    errors: [],
    warnings: [],
    notes: [],
    ...overrides,
  };
}

/** One evaluated rule. `notes` is empty: the suites that care about notes build
 *  the rule themselves. */
export function ruleEval(
  index: number,
  verdict: RuleEvaluation["verdict"],
  clauses: ClauseEvaluation[] = [],
): RuleEvaluation {
  return { index, verdict, clauses, notes: [] };
}

/** One evaluated clause. The defaults are a `matchSourceUrls` clause reading
 *  `sourceUrl` — the field the fail-closed no-input path is written against —
 *  with the rest overridable. */
export function clauseEval(
  state: ClauseEvaluation["state"],
  overrides: Partial<ClauseEvaluation> = {},
): ClauseEvaluation {
  return {
    key: "matchSourceUrls",
    value: ["x"],
    state,
    inputValues: {},
    readFields: ["sourceUrl"],
    ...overrides,
  };
}

/** A `MergeStop`'s rendering half is the replay list's payload; the
 *  derivations read only `kind`/`ruleIndex`/`merged`. */
export function stopChrome(id: string): Pick<MergeStop, "id" | "counter" | "head" | "explanation"> {
  return { id, counter: id, head: id, explanation: id };
}

export function baseStop(): MergeStop {
  return { kind: "base", ...stopChrome("base") };
}

export function ruleStop(ruleIndex: number, merged: MergedKey[]): MergeStop {
  return { kind: "rule", ruleIndex, merged, ...stopChrome(`rule-${ruleIndex}`) };
}

export function flattenStop(merged: MergedKey[]): MergeStop {
  return { kind: "flatten", merged, ...stopChrome("flatten") };
}

export function finalStop(): MergeStop {
  return { kind: "final", ...stopChrome("final") };
}
