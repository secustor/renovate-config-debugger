/**
 * Roadmap 018 — A/B run comparison. A pure, dependency-free diff of two
 * `SimulationResult`s (A = a pinned earlier run, B = the current run after the
 * config was edited and re-simulated): which rules matched only in A, only in
 * B, or in both, plus the key-level delta of the final per-dependency config,
 * plus an explicit "no behavioral change" verdict when both sets are equal.
 *
 * No Renovate imports — the `SimulationResult` reference is a `import type`,
 * erased at compile time — so this module runs (and unit-tests) with zero
 * engine/browser machinery.
 */
import type { RuleEvaluation, SimulationResult } from "./simulate-package-rules";

/** A matched rule identified by its selector signature (stable across edits). */
export interface RuleRef {
  /** Position in the run this rule came from (A's index for `both`). */
  index: number;
  /**
   * The rule's `match*` selectors as a stable string — key+value of every
   * clause, in registry order. Two rules with the same selectors compare equal
   * even if their position in `packageRules` shifted between edits.
   */
  signature: string;
  /** Human label: the joined clause keys, e.g. `matchSourceUrls + matchUpdateTypes`. */
  label: string;
}

/** One key whose final per-dependency value differs between A and B. */
export interface ConfigKeyDelta {
  key: string;
  /** A's value (only meaningful when `inA`). */
  before?: unknown;
  /** B's value (only meaningful when `inB`). */
  after?: unknown;
  inA: boolean;
  inB: boolean;
}

export interface SimulationComparison {
  /** Rules that matched in A but not in B (removed / no longer firing). */
  matchedOnlyInA: RuleRef[];
  /** Rules that matched in B but not in A (added / newly firing). */
  matchedOnlyInB: RuleRef[];
  /** Rules that matched in both runs. */
  matchedInBoth: RuleRef[];
  /** Final per-dependency config keys that changed, sorted by key. */
  configDelta: ConfigKeyDelta[];
  /** True when the matched-rule sets AND the final configs are identical. */
  noChange: boolean;
}

function signatureOf(rule: RuleEvaluation): string {
  return JSON.stringify(rule.clauses.map((c) => [c.key, c.value]));
}

function labelOf(rule: RuleEvaluation): string {
  return rule.clauses.length === 0
    ? "no match* selectors"
    : rule.clauses.map((c) => c.key).join(" + ");
}

function refOf(rule: RuleEvaluation): RuleRef {
  return { index: rule.index, signature: signatureOf(rule), label: labelOf(rule) };
}

function matchedRules(result: SimulationResult): RuleEvaluation[] {
  return result.rules.filter((r) => r.verdict === "matched");
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Compares a pinned run (`a`) with the current run (`b`). Matched rules are
 * paired greedily by selector signature (a multiset match, so a config with two
 * rules sharing selectors is handled), leftover A rules become `matchedOnlyInA`
 * and leftover B rules `matchedOnlyInB`.
 */
export function compareSimulations(a: SimulationResult, b: SimulationResult): SimulationComparison {
  const aMatched = matchedRules(a);
  const bRemaining = matchedRules(b);
  const matchedInBoth: RuleRef[] = [];
  const matchedOnlyInA: RuleRef[] = [];

  for (const ra of aMatched) {
    const sig = signatureOf(ra);
    const i = bRemaining.findIndex((rb) => signatureOf(rb) === sig);
    if (i >= 0) {
      matchedInBoth.push(refOf(ra));
      bRemaining.splice(i, 1);
    } else {
      matchedOnlyInA.push(refOf(ra));
    }
  }
  const matchedOnlyInB = bRemaining.map(refOf);

  const configA = a.finalDependencyConfig;
  const configB = b.finalDependencyConfig;
  const keys = [...new Set([...Object.keys(configA), ...Object.keys(configB)])].toSorted();
  const configDelta: ConfigKeyDelta[] = [];
  for (const key of keys) {
    const inA = key in configA;
    const inB = key in configB;
    if (jsonEqual(configA[key], configB[key])) {
      continue;
    }
    configDelta.push({
      key,
      ...(inA ? { before: configA[key] } : {}),
      ...(inB ? { after: configB[key] } : {}),
      inA,
      inB,
    });
  }

  const noChange =
    matchedOnlyInA.length === 0 && matchedOnlyInB.length === 0 && configDelta.length === 0;

  return { matchedOnlyInA, matchedOnlyInB, matchedInBoth, configDelta, noChange };
}
