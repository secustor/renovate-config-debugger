import type { ClauseEvaluation, MergedKey, RuleEvaluation } from "@renovate-config-debugger/engine";
import { isFailingClause, isNoInputNoMatch } from "@/lib/rule-verdict";

export function previewValue(value: unknown, max = 60): string {
  const text = JSON.stringify(value) ?? "undefined";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Untruncated JSON rendering — the copy-as-markdown export and (replay-02
 *  N6) the clause grid's click-to-expand both need the complete value; a
 *  60-char preview of a matchSourceUrls list is not a citable artifact. */
export function fullValue(value: unknown): string {
  return JSON.stringify(value) ?? "undefined";
}

/** Roadmap 018: a matched rule's applied keys as `key: before → after` lines.
 *  A merge that took a key away has no `after` at all — the export says so in
 *  words, the same way the rows do, rather than pasting `undefined`. */
export function ruleAppliedMarkdown(merged: MergedKey[]): string {
  return merged
    .map((m) => {
      const after = "after" in m ? fullValue(m.after) : "(removed)";
      return "before" in m ? `${m.key}: ${fullValue(m.before)} → ${after}` : `${m.key}: ${after}`;
    })
    .join("\n");
}

/** Roadmap 054 layer 7: `~` changed · `+` added · `−` removed — the mark a
 *  {@link WriteRow} leads with, so a write reads without re-parsing its
 *  before/after pair. Here rather than beside the component because a module
 *  that renders may only export components (Fast Refresh). */
export function writeMark(hadBefore: boolean, hadAfter: boolean): string {
  if (!hadAfter) {
    return "−";
  }
  return hadBefore ? "~" : "+";
}

function inputsPreview(clause: ClauseEvaluation): string {
  return Object.entries(clause.inputValues)
    .map(([key, value]) => `${key} = ${previewValue(value, 40)}`)
    .join(", ");
}

export function clauseIcon(state: ClauseEvaluation["state"]): string {
  if (state === "matched") {
    return "✓";
  }
  // Deliberately narrower than `isFailingClause`: no-input fails the rule too,
  // but gets its own glyph below.
  if (state === "no-match" || state === "error") {
    return "✗";
  }
  // no-input — evaluated to a real fail-closed `false` (see clauseExplanation),
  // but flagged rather than a plain ✗ since the cause is a missing input, not
  // a genuine mismatch against a value.
  if (state === "no-input") {
    return "⚠";
  }
  // not-applicable / not-simulated — the matcher never produced a true-or-false
  // verdict at all. Replay-02 R4: a distinct glyph from no-input, because the
  // icon is what survives a screenshot and "fail-closed false" vs "never
  // evaluated" are different facts about the run.
  return "∅";
}

/**
 * Roadmap 018/022: the clause row's right-hand explanation, precise about WHY
 * a clause did not match — a genuine mismatch names the input it compared
 * ("no match against sourceUrl = …"); a fail-closed clause states the actual
 * verdict and its cause ("evaluated false — the simulated dependency has no
 * sourceUrl (Renovate treats a missing value as a non-match)", from the
 * engine's note) rather than reading like the clause was never evaluated; a
 * null-returning matcher reads "not applicable (skipped)".
 *
 * Roadmap 054 layer 7: no longer exported — the prose clause list that read it
 * directly is gone, and every clause now arrives through `clauseEvaluated`.
 */
function clauseExplanation(clause: ClauseEvaluation): string {
  const hasInputs = Object.keys(clause.inputValues).length > 0;
  switch (clause.state) {
    case "matched":
      return hasInputs ? `matched (${inputsPreview(clause)})` : "matched";
    case "no-match":
      return hasInputs ? `no match against ${inputsPreview(clause)}` : "no match";
    case "no-input":
      return (
        clause.note ??
        "evaluated false — required input not set on the simulated dependency (Renovate treats a missing value as a non-match)"
      );
    case "not-applicable":
      return clause.note ?? "not applicable (skipped)";
    default:
      return clause.note ?? clause.state;
  }
}

/** Roadmap 054: the clause grid's last column — the value side of the
 *  comparison, split so the grid can style the value itself. */
export interface ClauseEvaluated {
  text: string;
  /** The input the matcher was compared against; absent when the state has
   *  nothing to show but its explanation. */
  value?: string;
}

/**
 * Roadmap 054 (variant A): a matched clause reads as a two-part sentence
 * across the grid — `checks ["npm"] · this update is "npm"` — because in a
 * thread the reader is comparing the two value columns, not reading prose.
 * Every other state keeps `clauseExplanation`'s precise wording: a fail-closed
 * or not-applicable clause has no "this update is …" to state, and the WHY is
 * the whole point of showing it.
 */
export function clauseEvaluated(clause: ClauseEvaluation): ClauseEvaluated {
  if (clause.state !== "matched") {
    return { text: clauseExplanation(clause) };
  }
  const inputs = Object.entries(clause.inputValues);
  const [only] = inputs;
  if (inputs.length === 0) {
    return { text: "matched" };
  }
  if (inputs.length === 1 && only) {
    return { text: "this update is", value: previewValue(only[1], 40) };
  }
  return { text: "this update has", value: inputsPreview(clause) };
}

const VERDICT_LABEL: Record<RuleEvaluation["verdict"], string> = {
  matched: "matched",
  "no-match": "no match",
  "not-simulated": "not simulated",
};

/**
 * Replay-02 R3/R4: the badge text for a rule's verdict. A no-match decided
 * SOLELY by fail-closed no-input clauses says so — "no match — input not set"
 * — because the badge is what survives a screenshot, and a rule that lost to
 * an empty simulator field is a different fact from one that mismatched real
 * data. Field-agnostic: driven by the clause state, not by which field the
 * matcher reads.
 */
export function ruleVerdictLabel(rule: Pick<RuleEvaluation, "verdict" | "clauses">): string {
  if (isNoInputNoMatch(rule)) {
    return "no match — input not set";
  }
  return VERDICT_LABEL[rule.verdict];
}

/**
 * Roadmap 013: label lists EVERY `match*` / `exclude*` clause the rule
 * carries, and names the one that decided a no-match verdict — e.g.
 * `matchSourceUrls + matchUpdateTypes — failed on matchSourceUrls`. A caption
 * with only the first clause plus a bare "no match" reads as broken when that
 * first clause actually matched and a LATER one is what failed it.
 */
export function ruleLabel(rule: RuleEvaluation): string {
  if (rule.clauses.length === 0) {
    return "no match* selectors";
  }
  const joined = rule.clauses.map((c) => c.key).join(" + ");
  // no-input (fail-closed: the dependency lacks the field) fails the rule just
  // like a genuine no-match, so it counts as the deciding clause here too.
  const failing = rule.clauses.find(isFailingClause);
  if (!failing) {
    return joined;
  }
  // Replay-02 R3: a fail-closed deciding clause names the unset field right in
  // the collapsed label — "failed on matchSourceUrls" alone reads identically
  // to a genuine mismatch, and the difference is the whole diagnosis. Works
  // for whatever field(s) the matcher reads (`readFields`), not just sourceUrl.
  if (failing.state === "no-input" && failing.readFields.length > 0) {
    return `${joined} — failed on ${failing.key} (${failing.readFields.join("/")} not set in this simulation)`;
  }
  return `${joined} — failed on ${failing.key}`;
}
