import { jsonText } from "./json";
import type { ClauseEvaluation, RuleEvaluation } from "./simulate-package-rules";
import { countNoun } from "./text";

/**
 * The per-clause predicates a scoped rule list would hide, and the AGGREGATES
 * built on them — the facts that must survive every filter, every projection
 * and the MCP transport's elision.
 *
 * The failure this exists for: a rule that read a field the simulated
 * dependency never set fails CLOSED (upstream's `if (!sourceUrl) return
 * false`), so its rule-level verdict is a plain `no-match` — and every view
 * that scopes the rule list (`notable`, `matched`, the app's drawer default,
 * `rcd simulate`'s pretty default) then hides it. The reader is left with "no
 * rule matched" and no way to learn that three rules never got the chance.
 * A per-row fact cannot fix that, because the rows are exactly what the filter
 * removed: the signal has to be an AGGREGATE that travels with the result,
 * outside the array anyone may filter or elide.
 *
 * Roadmap 073 added the second aggregate for the same reason, one step worse:
 * a clause whose matcher THREW is recorded `state: "error"` and also pushes the
 * rule to `verdict: "no-match"`, so a focused default would have hidden "the
 * tool could not evaluate this rule" — the one thing that may never go missing.
 * Every narrowing on top of this module is gated on its aggregates being
 * unconditional, so the two live side by side.
 *
 * Imports nothing but types and the engine's own import-free prose and JSON
 * helpers, so this module is Renovate-free and unit-testable in the engine's
 * `golden` (plain node) project.
 *
 * That property is why it also has its own `exports` subpath. The app's
 * `lib/rule-verdict.ts` re-exports the predicates below, and reaching them
 * through the root barrel put the entire Renovate graph on the static path of
 * the app's results chunk. Keep the import list above as it is — a value import
 * of anything Renovate-touching here would silently re-weld it.
 *
 * The app has a narrower cousin, `buildNoInputCaveat`
 * (`lib/verdict-sentence.ts`), which counts only REPO-config rules via
 * `ruleAttribution`. It is deliberately not the same number — a naive swap
 * would fire on every `config:best-practices` run — so it keeps its scoping
 * and is not folded in here.
 */

/** Whether a clause fails its rule (as opposed to the neutral
 *  not-applicable / not-simulated, which decide nothing). Exported because the
 *  app spells this same disjunction wherever it names the deciding clause. */
export function isFailingClause(clause: Pick<ClauseEvaluation, "state">): boolean {
  return clause.state === "no-match" || clause.state === "no-input" || clause.state === "error";
}

function failingClauses(clauses: readonly ClauseEvaluation[]): ClauseEvaluation[] {
  return clauses.filter(isFailingClause);
}

/**
 * Replay-02 R3/R4: a no-match decided SOLELY by fail-closed no-input clauses —
 * the rule lost to an empty simulator field (or a `--dep` that omitted the
 * field), not to real data that mismatched.
 */
export function isNoInputNoMatch(rule: Pick<RuleEvaluation, "verdict" | "clauses">): boolean {
  if (rule.verdict !== "no-match") {
    return false;
  }
  const failing = failingClauses(rule.clauses);
  return failing.length > 0 && failing.every((c) => c.state === "no-input");
}

/** "sourceUrl" / "packageFile or lockFiles" — the fields a matcher reads,
 *  for the fail-closed "no X set on the simulated dependency" explanation. */
export function humanFieldList(fields: readonly string[]): string {
  if (fields.length <= 1) {
    return fields[0] ?? "matching input";
  }
  return `${fields.slice(0, -1).join(", ")} or ${fields.at(-1)}`;
}

/** One dependency field-set that decided rules against themselves. */
export interface MissingInputGroup {
  /** The clause's `readFields`, in matcher-registry order: `["sourceUrl"]`,
   *  `["packageFile", "lockFiles"]`. */
  fields: string[];
  /** `humanFieldList(fields)` — the exact phrasing the per-clause note uses,
   *  so the summary and the row agree word for word. */
  fieldList: string;
  /** The `match*` selectors that reported `no-input` on these fields, deduped,
   *  sorted. */
  selectors: string[];
  /** Distinct rules that failed SOLELY on unset input and read these fields. */
  rules: number;
  /** The first five of those rules' `RuleEvaluation.index` values, ascending —
   *  a drill-down handle, not the list; the `no-input` verdict facet is. */
  sampleRuleIndexes: number[];
}

export interface MissingInputSummary {
  /** Distinct rules across all groups — equal, by construction, to the count
   *  the `no-input` verdict facet prints. */
  rules: number;
  /** Most rules first, then `fieldList` ascending. A rule with two no-input
   *  clauses appears in two groups: the question each answers is "what would
   *  setting THIS field buy me". */
  groups: MissingInputGroup[];
  /** The whole thing in one transport-neutral line — no flag or parameter
   *  spelling, and no rule numbering, because the surfaces number rules
   *  differently and own their own vocabulary. Absent when `rules === 0`. */
  note?: string;
}

/** How many field groups the note names before it starts counting. */
const NAMED_GROUPS = 3;

/** Per-group `RuleEvaluation.index` samples kept, at most. */
const SAMPLE_LIMIT = 5;

function buildNote(total: number, ruleCount: number, groups: MissingInputGroup[]): string {
  const scope = `${ruleCount} of ${countNoun(total, "rule")} could not match because `;
  const tail =
    " — Renovate treats a missing value as a non-match. " +
    `Set ${groups.length === 1 ? groups[0]?.fieldList : "them"} on the dependency if you ` +
    "expected these rules to fire.";
  if (groups.length === 1) {
    return `${scope}the simulated dependency has no ${groups[0]?.fieldList}${tail}`;
  }
  const named = groups
    .slice(0, NAMED_GROUPS)
    .map((group) => `${group.fieldList} (${countNoun(group.rules, "rule")})`)
    .join(", ");
  const more = groups.length - NAMED_GROUPS;
  const list = more > 0 ? `${named}, and ${countNoun(more, "more field")}` : named;
  return `${scope}the simulated dependency leaves fields they read unset: ${list}${tail}`;
}

interface GroupAccumulator {
  fields: string[];
  selectors: Set<string>;
  ruleIndexes: Set<number>;
}

/**
 * The rules a dependency's unset fields cost, grouped by the fields that were
 * unset. Reads the finished verdicts only — it decides nothing and changes
 * nothing about the simulation it describes.
 */
export function summarizeMissingInputs(rules: readonly RuleEvaluation[]): MissingInputSummary {
  const accumulators = new Map<string, GroupAccumulator>();
  const affected = new Set<number>();
  for (const rule of rules) {
    if (!isNoInputNoMatch(rule)) {
      continue;
    }
    affected.add(rule.index);
    for (const clause of rule.clauses) {
      if (clause.state !== "no-input") {
        continue;
      }
      const fields = [...clause.readFields];
      const key = jsonText(fields);
      let accumulator = accumulators.get(key);
      if (!accumulator) {
        accumulator = { fields, selectors: new Set(), ruleIndexes: new Set() };
        accumulators.set(key, accumulator);
      }
      accumulator.selectors.add(clause.key);
      accumulator.ruleIndexes.add(rule.index);
    }
  }
  const groups: MissingInputGroup[] = [...accumulators.values()]
    .map((accumulator) => ({
      fields: accumulator.fields,
      fieldList: humanFieldList(accumulator.fields),
      selectors: [...accumulator.selectors].toSorted(),
      rules: accumulator.ruleIndexes.size,
      sampleRuleIndexes: [...accumulator.ruleIndexes]
        .toSorted((a, b) => a - b)
        .slice(0, SAMPLE_LIMIT),
    }))
    .toSorted((a, b) => b.rules - a.rules || a.fieldList.localeCompare(b.fieldList));
  if (groups.length === 0) {
    return { rules: 0, groups: [] };
  }
  return {
    rules: affected.size,
    groups,
    note: buildNote(rules.length, affected.size, groups),
  };
}

/**
 * A clause of this rule could not be evaluated at all: the matcher threw, and
 * the simulator recorded `state: "error"` with the reason.
 *
 * Upstream treats a throwing matcher as a non-match, so the rule's verdict is
 * an ordinary `no-match` — which makes this predicate, not the verdict, the
 * only thing standing between an evaluation failure and a scoped view that
 * drops it. `matchesVerdictFilter`'s `notable` facet reads it for exactly that
 * reason (roadmap 073); the documented case is `matchCurrentVersion` on a
 * `conda` dependency, whose versioning module the browser build excludes.
 */
export function hasEvaluationError(rule: Pick<RuleEvaluation, "clauses">): boolean {
  return rule.clauses.some((clause) => clause.state === "error");
}

export interface EvaluationErrorSummary {
  /** Distinct rules with at least one clause the simulator could not evaluate. */
  rules: number;
  /** The `match*` selectors that threw, deduped, sorted. */
  selectors: string[];
  /** Up to five distinct reasons, sorted — a signal, not a log. The rows
   *  themselves carry every clause's own `note`. */
  messages: string[];
  /** The first five affected `RuleEvaluation.index` values, ascending — a
   *  drill-down handle, the way {@link MissingInputGroup.sampleRuleIndexes} is. */
  sampleRuleIndexes: number[];
  /** The whole thing in one transport-neutral line, with the honest caveat that
   *  a result containing one of these is not a claim about a real Renovate run.
   *  Absent when `rules === 0`. */
  note?: string;
}

/** Distinct clause messages kept, at most. */
const MESSAGE_LIMIT = 5;

function buildErrorNote(total: number, ruleCount: number, selectors: string[]): string {
  const scope =
    `${ruleCount} of ${countNoun(total, "rule")} could not be EVALUATED: ` +
    `${selectors.map((selector) => `\`${selector}\``).join(", ")} threw`;
  return (
    `${scope}. The tool could not evaluate ${ruleCount === 1 ? "this rule" : "these rules"}, so ` +
    "this result may not reflect a real Renovate run — treat the verdict as incomplete rather " +
    "than as a non-match."
  );
}

/**
 * The rules whose evaluation failed, as one aggregate. Reads the finished
 * verdicts only — it decides nothing and changes nothing about the simulation
 * it describes.
 */
export function summarizeEvaluationErrors(
  rules: readonly RuleEvaluation[],
): EvaluationErrorSummary {
  const selectors = new Set<string>();
  const messages = new Set<string>();
  const affected: number[] = [];
  for (const rule of rules) {
    if (!hasEvaluationError(rule)) {
      continue;
    }
    affected.push(rule.index);
    for (const clause of rule.clauses) {
      if (clause.state !== "error") {
        continue;
      }
      selectors.add(clause.key);
      if (clause.note) {
        messages.add(clause.note);
      }
    }
  }
  const sortedSelectors = [...selectors].toSorted();
  const summary: EvaluationErrorSummary = {
    rules: affected.length,
    selectors: sortedSelectors,
    messages: [...messages].toSorted().slice(0, MESSAGE_LIMIT),
    sampleRuleIndexes: affected.toSorted((a, b) => a - b).slice(0, SAMPLE_LIMIT),
  };
  if (summary.rules === 0) {
    return summary;
  }
  return { ...summary, note: buildErrorNote(rules.length, summary.rules, sortedSelectors) };
}
