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
  /**
   * Replay-02 N8: true when A carries the key but NO merge step in A wrote it
   * — the value is an inherited Renovate default, not something the config
   * set. Without this the delta asserted an explicit `automerge: false` that
   * A's own field list (correctly) never showed. Present only when true.
   */
  beforeInherited?: boolean;
  /** Same, for B's side of the delta. */
  afterInherited?: boolean;
}

/**
 * Roadmap 062: a matched rule that is present on both sides by EFFECT — it
 * merged exactly the same keys to the same values — but whose selector text
 * changed, so the two sides pair on neither signature nor index.
 *
 * This is the ordinary shape of a behavior-preserving edit: removing an entry
 * from `matchPackageNames` necessarily rewrites the signature of the very rule
 * that array belongs to. Naming it as identity churn is what lets the behavior
 * verdict stay `noChange: true`.
 */
export interface SignatureChange {
  /** A's rule. */
  a: RuleRef;
  /** B's rule — same effect, different selector text. */
  b: RuleRef;
}

export interface SimulationComparison {
  /** Rules that matched in A but no rule in B carries their selector signature
   *  (removed, or rewritten — see {@link SignatureChange}). Identity axis. */
  matchedOnlyInA: RuleRef[];
  /** Rules that matched in B but no rule in A carries their selector signature.
   *  Identity axis. */
  matchedOnlyInB: RuleRef[];
  /** Rules that matched in both runs, paired by selector signature. */
  matchedInBoth: RuleRef[];
  /**
   * Roadmap 062 — the BEHAVIOR axis of `matchedOnlyInA`: rules whose effect no
   * rule in B reproduced. A rule that merely had its pattern rewritten is not
   * here (it is in {@link signatureChanges}); a rule that genuinely stopped
   * doing something is.
   */
  behaviorOnlyInA: RuleRef[];
  /** The same for B: effects no rule in A produced — what genuinely started. */
  behaviorOnlyInB: RuleRef[];
  /** Same effect on both sides, different selector text (identity churn only). */
  signatureChanges: SignatureChange[];
  /** IDENTITY: any matched rule's selector signature differs between A and B —
   *  added, removed, or rewritten. True is expected, and harmless, whenever the
   *  edit touched the array a rule matches on. */
  rulesChanged: boolean;
  /** Final per-dependency config keys that changed, sorted by key. */
  configDelta: ConfigKeyDelta[];
  /**
   * BEHAVIOR: the resulting per-dependency config is identical AND every effect
   * the matched rules produced in A is still produced in B (and vice versa).
   *
   * Roadmap 062 (2026-07 persona study, 2 of 9 sessions): this used to be the
   * identity verdict — it went false whenever a selector signature moved, so a
   * provably behavior-preserving edit headlined as "Behavior differs" with an
   * EMPTY `configDelta` underneath. Both personas had to read past the
   * headline; one called the result uncitable. The identity fact is still
   * reported, as {@link rulesChanged} and {@link signatureChanges} — it is just
   * no longer allowed to speak for behavior.
   */
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

/**
 * What a matched rule DID, as a stable string: the keys it merged and the
 * values it left behind. `undefined` when the run never recorded a merge for
 * this rule — a hand-built fixture, or a result from before `merged` existed.
 * An unrecorded effect must never pair with another unrecorded effect, or two
 * unrelated rules would read as "the same rule, renamed".
 *
 * Keyed on `after` rather than the full before/after pair: the "before" of a
 * merge is the cumulative config at that point, so it moves whenever an
 * EARLIER rule changed — the question here is what this rule set the value to.
 */
function effectOf(rule: RuleEvaluation): string | undefined {
  if (rule.merged === undefined) {
    return undefined;
  }
  const entries = rule.merged.map((m): [string, unknown] => [m.key, "after" in m ? m.after : null]);
  return JSON.stringify(entries.toSorted((x, y) => x[0].localeCompare(y[0])));
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** Replay-02 N8: a key nothing in the run wrote (no rule step, no flatten
 *  step) reached the final config by inheritance — Renovate's own default or
 *  the pre-rules base — not through the user's rules. */
function inheritedIn(result: SimulationResult, key: string): boolean {
  return !result.mergeSteps.some((step) => step.merged.some((m) => m.key === key));
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
  const unpairedA: RuleEvaluation[] = [];

  for (const ra of aMatched) {
    const sig = signatureOf(ra);
    const i = bRemaining.findIndex((rb) => signatureOf(rb) === sig);
    if (i >= 0) {
      matchedInBoth.push(refOf(ra));
      bRemaining.splice(i, 1);
    } else {
      matchedOnlyInA.push(refOf(ra));
      unpairedA.push(ra);
    }
  }
  const matchedOnlyInB = bRemaining.map(refOf);

  // Roadmap 062, second pass: the rules the SIGNATURE pass left over, paired
  // again by what they merged. Whatever pairs here changed its pattern text
  // without changing what it did — identity churn, not behavior. Whatever is
  // still left over is a real behavioral difference.
  const unpairedB = [...bRemaining];
  const signatureChanges: SignatureChange[] = [];
  const behaviorOnlyInA: RuleRef[] = [];
  for (const ra of unpairedA) {
    const effect = effectOf(ra);
    const i = effect === undefined ? -1 : unpairedB.findIndex((rb) => effectOf(rb) === effect);
    const paired = i >= 0 ? unpairedB[i] : undefined;
    if (paired) {
      signatureChanges.push({ a: refOf(ra), b: refOf(paired) });
      unpairedB.splice(i, 1);
    } else {
      behaviorOnlyInA.push(refOf(ra));
    }
  }
  const behaviorOnlyInB = unpairedB.map(refOf);

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
      ...(inA && inheritedIn(a, key) ? { beforeInherited: true } : {}),
      ...(inB && inheritedIn(b, key) ? { afterInherited: true } : {}),
    });
  }

  const rulesChanged = matchedOnlyInA.length > 0 || matchedOnlyInB.length > 0;
  const noChange =
    behaviorOnlyInA.length === 0 && behaviorOnlyInB.length === 0 && configDelta.length === 0;

  return {
    matchedOnlyInA,
    matchedOnlyInB,
    matchedInBoth,
    behaviorOnlyInA,
    behaviorOnlyInB,
    signatureChanges,
    rulesChanged,
    configDelta,
    noChange,
  };
}
