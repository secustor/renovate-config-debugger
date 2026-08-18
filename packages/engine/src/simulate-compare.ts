/**
 * Roadmap 018 — A/B run comparison. A pure, dependency-free diff of two
 * `SimulationResult`s (A = one run, B = the other), stated so that the FIRST
 * thing a reader meets is the answer: what the difference amounts to, in
 * words, followed by the fields that justify it.
 *
 * Two axes, and only one of them is a claim about behavior:
 *
 * - BEHAVIOR — `verdict`, `stoppedMatching`, `startedMatching`, `configDelta`.
 *   This is the citable answer to "did my edit change anything?".
 * - IDENTITY — everything under `identity`. A selector's TEXT moved. That is
 *   unavoidable whenever the edit is to the very array a rule matches on, so
 *   on its own it means nothing; it is nested rather than deleted because a
 *   reader who asks "which rule did I touch?" still needs it, and a top-level
 *   `matchedOnlyInA` was read as "stopped matching" in 6 of 9 sessions of the
 *   2026-07 persona study.
 *
 * No Renovate imports — the `SimulationResult` reference is a `import type`,
 * erased at compile time — so this module runs (and unit-tests) with zero
 * engine/browser machinery.
 */
import type { RuleEvaluation, SimulationResult } from "./simulate-package-rules";

/**
 * What the caller varied between A and B. The engine cannot derive it — a
 * `SimulationResult` carries no dependency descriptor — and a wrong guess is
 * how the comparison came to claim "a rule's pattern text changed" about two
 * runs of one identical config file. So it is an input, and it defaults to
 * `unspecified` rather than to the commoner case.
 */
export type ComparisonMode = "config" | "dependency" | "unspecified";

/**
 * The behavior verdict, as three states rather than a boolean. `identical` and
 * `differs` are the obvious two; `documentation-only` exists because
 * `description` is prose Renovate accumulates from every matched rule, so an
 * edit that only re-words a rule moves a config key without moving behavior —
 * and calling that "differs" is as wrong as hiding it.
 */
export type ComparisonVerdict = "identical" | "documentation-only" | "differs";

/** How a paired rule's selectors differ between the two sides. */
export type SelectorChangeKind =
  | "clause-added"
  | "clause-removed"
  | "clause-values-changed"
  | "clause-rewritten"
  /** Only in `mode: "dependency"`: the config is the SAME file on both sides,
   *  so nothing was rewritten — two different entries of one `packageRules`
   *  array happened to produce the same effect for their own dependency. */
  | "different-rule";

/** Whether a changed key can change what Renovate does. */
export type DeltaKind = "behavioral" | "documentation";

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

/**
 * One key whose final per-dependency value differs between A and B.
 *
 * `a`/`b`, not `before`/`after`: a comparison has no chronology. B is the
 * later config in `mode: "config"`, but in `mode: "dependency"` the two sides
 * are one config seen through two dependencies, and calling either of them
 * "before" is a claim the data does not support.
 */
export interface ConfigKeyDelta {
  key: string;
  /** Whether this key can change what Renovate does ({@link DOCUMENTATION_KEYS}). */
  kind: DeltaKind;
  /** A's value (only meaningful when `inA`). */
  a?: unknown;
  /** B's value (only meaningful when `inB`). */
  b?: unknown;
  inA: boolean;
  inB: boolean;
  /**
   * Replay-02 N8: true when A carries the key but NO merge step in A wrote it
   * — the value is an inherited Renovate default, not something the config
   * set. Without this the delta asserted an explicit `automerge: false` that
   * A's own field list (correctly) never showed. Present only when true.
   */
  aInherited?: boolean;
  /** Same, for B's side of the delta. */
  bInherited?: boolean;
}

/**
 * A matched rule that is present on both sides by EFFECT — it merged exactly
 * the same keys to the same values — but that neither signature nor index
 * pairs.
 *
 * In `mode: "config"` this is the ordinary shape of a behavior-preserving
 * edit: removing an entry from `matchPackageNames` necessarily rewrites the
 * signature of the very rule that array belongs to. Naming it as identity
 * churn is what lets the behavior verdict stay `identical`.
 */
export interface SignatureChange {
  /** A's rule. */
  a: RuleRef;
  /** B's rule — same effect, different selector text. */
  b: RuleRef;
  /** WHAT differs about the selectors, computed from both rules' clauses. */
  kind: SelectorChangeKind;
  /** The clause keys the change is about, sorted. Empty for `different-rule`,
   *  where no clause changed at all. */
  keys: string[];
}

/**
 * The identity axis, whole and in one place. Every member of it is bookkeeping
 * about selector TEXT; none of it is a claim about behavior.
 */
export interface RuleIdentityChurn {
  /** Any matched rule's selector signature differs between A and B — added,
   *  removed, or rewritten. True is expected, and harmless, whenever the edit
   *  touched the array a rule matches on. */
  changed: boolean;
  /** Same effect on both sides, different selector text. */
  signatureChanges: SignatureChange[];
  /** Rules whose selector signature no rule in B carries. INCLUDES the `a` of
   *  every {@link signatureChanges} entry — this is the signature-level fact,
   *  not "stopped matching". */
  onlyInA: RuleRef[];
  /** Rules whose selector signature no rule in A carries. */
  onlyInB: RuleRef[];
}

export interface SimulationComparison {
  /** The whole verdict as one line: `${verdict}: ${netEffect}`. First, because
   *  object-literal order is JSON order and JSON order is reading order. */
  summary: string;
  /** The behavior verdict, structured. */
  verdict: ComparisonVerdict;
  /** The words after the colon of {@link summary}, so no consumer has to slice
   *  a string to headline the result in its own voice. */
  netEffect: string;
  /** What the caller varied between A and B; `unspecified` when it did not say. */
  mode: ComparisonMode;
  /** BEHAVIOR: rules whose effect no rule in B reproduced — what genuinely
   *  stopped happening. A rule that merely had its pattern rewritten is not
   *  here (it is in `identity.signatureChanges`). */
  stoppedMatching: RuleRef[];
  /** BEHAVIOR: effects no rule in A produced — what genuinely started. */
  startedMatching: RuleRef[];
  /** Rules that matched in both runs, paired by selector signature. */
  matchedInBoth: RuleRef[];
  /** Final per-dependency config keys that changed: behavioral keys first,
   *  alphabetical within each group. One ordering for the array, the summary,
   *  the CLI list and the app's delta column. */
  configDelta: ConfigKeyDelta[];
  /** The identity axis. Not a behavior claim — see {@link RuleIdentityChurn}. */
  identity: RuleIdentityChurn;
}

/** Options for {@link compareSimulations}. */
export interface CompareOptions {
  /** What the caller varied between A and B. Defaults to `unspecified`. */
  mode?: ComparisonMode;
}

/**
 * Top-level config keys that are pure prose: they can move without anything
 * Renovate DOES moving with them.
 *
 * Deliberately hardcoded, and deliberately tiny. `description` is Renovate's
 * only pure-prose top-level option — the array `mergeChildConfig` concatenates
 * from every matched rule, which is why it moves whenever the matched-rule set
 * moves — and this module must stay import-free.
 */
const DOCUMENTATION_KEYS = new Set(["description"]);

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

/** A rule's clauses as key → stable value text, so two rules can be compared
 *  clause by clause without re-parsing the signature string. */
function clauseValues(rule: RuleEvaluation): Map<string, string> {
  return new Map(rule.clauses.map((c) => [c.key, JSON.stringify(c.value) ?? "null"]));
}

/**
 * WHAT changed about a paired rule's selectors, from the two evaluations
 * themselves. Computed at pairing time, where both sides are in hand — the
 * alternative (a hardcoded sentence at summary time) is exactly the defect
 * this replaces: it announced "a rule's pattern text changed" for edits that
 * ADDED a clause, and for two runs of one identical config file.
 */
function selectorChangeOf(
  a: RuleEvaluation,
  b: RuleEvaluation,
  mode: ComparisonMode,
): Pick<SignatureChange, "kind" | "keys"> {
  if (mode === "dependency") {
    // One config file, two dependencies: no selector text can have changed,
    // because there is only one copy of it. These are two different rules.
    return { kind: "different-rule", keys: [] };
  }
  const ca = clauseValues(a);
  const cb = clauseValues(b);
  const added = [...cb.keys()].filter((key) => !ca.has(key)).toSorted();
  const removed = [...ca.keys()].filter((key) => !cb.has(key)).toSorted();
  const changed = [...ca.keys()].filter((key) => cb.has(key) && cb.get(key) !== ca.get(key));
  if (added.length > 0 && removed.length === 0 && changed.length === 0) {
    return { kind: "clause-added", keys: added };
  }
  if (removed.length > 0 && added.length === 0 && changed.length === 0) {
    return { kind: "clause-removed", keys: removed };
  }
  if (added.length === 0 && removed.length === 0 && changed.length > 0) {
    return { kind: "clause-values-changed", keys: changed.toSorted() };
  }
  return { kind: "clause-rewritten", keys: [...added, ...removed, ...changed].toSorted() };
}

/** How many changed keys the one-liner names before it starts counting. */
const SUMMARY_KEY_LIMIT = 6;
/** Past this, the annotated key list stops being a line and drops to bare names. */
const SUMMARY_LINE_BUDGET = 140;
/** A value long enough to be a document, not an annotation. */
const SUMMARY_VALUE_BUDGET = 24;

function countOf(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function valueText(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

/** One selector change, named. Singular — the caller decides when to count. */
function churnPhrase(change: SignatureChange): string {
  const list = change.keys.join(" + ");
  switch (change.kind) {
    case "clause-added":
      return change.keys.length === 1
        ? `a rule gained a ${list} clause`
        : `a rule gained ${list} clauses`;
    case "clause-removed":
      return change.keys.length === 1
        ? `a rule dropped its ${list} clause`
        : `a rule dropped its ${list} clauses`;
    case "clause-values-changed":
      return change.keys.length === 1
        ? `a rule's ${list} list changed`
        : `a rule's ${list} lists changed`;
    case "different-rule":
      return "a different rule produced the same effect for each dependency";
    default:
      return "a rule's selectors were rewritten";
  }
}

/** The same, counted, for several changes that agree on their kind. */
function churnPhraseOfMany(kind: SelectorChangeKind, n: number): string {
  switch (kind) {
    case "clause-added":
      return `${countOf(n, "rule")} gained a selector clause`;
    case "clause-removed":
      return `${countOf(n, "rule")} dropped a selector clause`;
    case "clause-values-changed":
      return `${countOf(n, "rule")} changed a selector's values`;
    case "different-rule":
      return `${countOf(n, "different rule")} produced the same effects for each dependency`;
    default:
      return `${countOf(n, "rule")} had their selectors rewritten`;
  }
}

/** The parenthetical of an `identical:` verdict, derived from what actually
 *  changed rather than asserted. */
function churnOf(changes: readonly SignatureChange[]): string {
  const [first] = changes;
  if (!first) {
    return "a rule's selectors changed";
  }
  if (changes.length === 1) {
    return churnPhrase(first);
  }
  return changes.every((change) => change.kind === first.kind)
    ? churnPhraseOfMany(first.kind, changes.length)
    : `${countOf(changes.length, "rule")} changed selectors without changing what they do`;
}

/** One side of a key delta, in words: the value, whether the side has it at
 *  all, and whether the value is a default the config never set. */
function sideText(run: "A" | "B", value: unknown, present: boolean, inherited?: boolean): string {
  if (!present) {
    return `unset in ${run}`;
  }
  return `${run}=${valueText(value)}${inherited ? " by default" : ""}`;
}

function annotatedKey(delta: ConfigKeyDelta): string {
  const a = sideText("A", delta.a, delta.inA, delta.aInherited);
  const b = sideText("B", delta.b, delta.inB, delta.bInherited);
  return `${delta.key} (${a}, ${b})`;
}

function withinValueBudget(delta: ConfigKeyDelta): boolean {
  return (
    (!delta.inA || valueText(delta.a).length <= SUMMARY_VALUE_BUDGET) &&
    (!delta.inB || valueText(delta.b).length <= SUMMARY_VALUE_BUDGET)
  );
}

/**
 * The changed keys, with direction and values while they still fit on a line.
 * Annotation is all-or-nothing: half a list annotated reads as if the bare
 * half had no values, which is a worse answer than a bare list.
 */
function keyList(deltas: readonly ConfigKeyDelta[]): string {
  const shown = deltas.slice(0, SUMMARY_KEY_LIMIT);
  const rest = deltas.length - shown.length;
  const tail = rest > 0 ? ` and ${rest} more` : "";
  const annotated = `${shown.map(annotatedKey).join(", ")}${tail}`;
  if (shown.every(withinValueBudget) && annotated.length <= SUMMARY_LINE_BUDGET) {
    return annotated;
  }
  return `${shown.map((delta) => delta.key).join(", ")}${tail}`;
}

/**
 * The net effect, in one line, without the verdict prefix. Ordered by what a
 * reader actually asked: the config delta is the citable answer when there is
 * one, the rules that started or stopped doing something is the answer when
 * the config came out the same, and the identity churn is a parenthetical
 * either way — never the headline, because for the commonest
 * behavior-preserving edit it is guaranteed true.
 */
function netEffectOf(
  verdict: ComparisonVerdict,
  comparison: Omit<SimulationComparison, "summary" | "verdict" | "netEffect">,
): string {
  const behavioral = comparison.configDelta.filter((delta) => delta.kind === "behavioral");
  const documentation = comparison.configDelta.filter((delta) => delta.kind === "documentation");
  if (verdict === "identical") {
    return comparison.identity.changed
      ? `the same effective config results (${churnOf(comparison.identity.signatureChanges)})`
      : "the same rules matched and the same effective config results";
  }
  if (verdict === "documentation-only") {
    const named = documentation.map((delta) => delta.key).join(", ");
    return `only ${named} changed — documentation text, no behavioral difference`;
  }
  const ruleChanges = [
    ...(comparison.startedMatching.length > 0
      ? [`${countOf(comparison.startedMatching.length, "rule")} started matching`]
      : []),
    ...(comparison.stoppedMatching.length > 0
      ? [`${countOf(comparison.stoppedMatching.length, "rule")} stopped matching`]
      : []),
  ];
  const documentationTail =
    documentation.length > 0
      ? [`${documentation.map((delta) => delta.key).join(", ")} also changed (documentation)`]
      : [];
  if (behavioral.length > 0) {
    return [keyList(behavioral), ...documentationTail, ...ruleChanges].join("; ");
  }
  // Stated even when documentation text moved (replay-04): "1 rule started
  // matching; description also changed" read as a behavioral claim, and the
  // one fact that scopes it — the effective config came out the same — was
  // the clause this branch used to drop.
  return [
    `${ruleChanges.join(" and ")}, with no change to the effective config`,
    ...documentationTail,
  ].join("; ");
}

/**
 * Compares run `a` with run `b`. Matched rules are paired greedily by selector
 * signature (a multiset match, so a config with two rules sharing selectors is
 * handled); the leftovers are paired again by what they MERGED, and whatever
 * pairs there changed its identity without changing its behavior.
 *
 * `options.mode` says what the caller varied. It is the difference between "a
 * rule's selectors were rewritten" (true only when the config text differs)
 * and "a different rule produced the same effect for each dependency" (the
 * only possible reading when one config file is simulated against two
 * dependencies).
 */
export function compareSimulations(
  a: SimulationResult,
  b: SimulationResult,
  options: CompareOptions = {},
): SimulationComparison {
  const mode = options.mode ?? "unspecified";
  const aMatched = matchedRules(a);
  const bRemaining = matchedRules(b);
  const matchedInBoth: RuleRef[] = [];
  const onlyInA: RuleRef[] = [];
  const unpairedA: RuleEvaluation[] = [];

  for (const ra of aMatched) {
    const sig = signatureOf(ra);
    const i = bRemaining.findIndex((rb) => signatureOf(rb) === sig);
    if (i >= 0) {
      matchedInBoth.push(refOf(ra));
      bRemaining.splice(i, 1);
    } else {
      onlyInA.push(refOf(ra));
      unpairedA.push(ra);
    }
  }
  const onlyInB = bRemaining.map(refOf);

  // Second pass: the rules the SIGNATURE pass left over, paired again by what
  // they merged. Whatever pairs here did the same thing on both sides —
  // identity churn, not behavior. Whatever is still left over is a real
  // behavioral difference.
  const unpairedB = [...bRemaining];
  const signatureChanges: SignatureChange[] = [];
  const stoppedMatching: RuleRef[] = [];
  for (const ra of unpairedA) {
    const effect = effectOf(ra);
    const i = effect === undefined ? -1 : unpairedB.findIndex((rb) => effectOf(rb) === effect);
    const paired = i >= 0 ? unpairedB[i] : undefined;
    if (paired) {
      signatureChanges.push({
        a: refOf(ra),
        b: refOf(paired),
        ...selectorChangeOf(ra, paired, mode),
      });
      unpairedB.splice(i, 1);
    } else {
      stoppedMatching.push(refOf(ra));
    }
  }
  const startedMatching = unpairedB.map(refOf);

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
      kind: DOCUMENTATION_KEYS.has(key) ? "documentation" : "behavioral",
      ...(inA ? { a: configA[key] } : {}),
      ...(inB ? { b: configB[key] } : {}),
      inA,
      inB,
      ...(inA && inheritedIn(a, key) ? { aInherited: true } : {}),
      ...(inB && inheritedIn(b, key) ? { bInherited: true } : {}),
    });
  }
  // Behavioral first, alphabetical within group — the summary names them in
  // this order, so the array under it must too.
  configDelta.sort((x, y) =>
    x.kind === y.kind ? x.key.localeCompare(y.key) : x.kind === "behavioral" ? -1 : 1,
  );

  const identity: RuleIdentityChurn = {
    changed: onlyInA.length > 0 || onlyInB.length > 0,
    signatureChanges,
    onlyInA,
    onlyInB,
  };
  const behavioralKeys = configDelta.some((delta) => delta.kind === "behavioral");
  const rulesMoved = stoppedMatching.length > 0 || startedMatching.length > 0;
  const verdict: ComparisonVerdict =
    rulesMoved || behavioralKeys
      ? "differs"
      : configDelta.length > 0
        ? "documentation-only"
        : "identical";

  const core = {
    mode,
    stoppedMatching,
    startedMatching,
    matchedInBoth,
    configDelta,
    identity,
  };
  const netEffect = netEffectOf(verdict, core);
  return { summary: `${verdict}: ${netEffect}`, verdict, netEffect, ...core };
}
