/**
 * One-line summaries of a raw `packageRules` entry — what it selects, and what
 * it writes — read straight off the merged rule body.
 *
 * Hoisted out of `EffectiveConfig.tsx` by roadmap 069: the description digest
 * needs the same "which matchers does this rule carry" sentence the effective
 * config's per-rule provenance list already prints, and a second spelling of it
 * would be a second answer to the same question. Pure and DOM-free, hence
 * `lib/` — the simulator's `ruleLabel` is the richer variant, but it needs an
 * evaluated `RuleEvaluation`, which neither of these two callers has.
 */

function ruleKeys(rule: unknown): string[] | null {
  if (typeof rule !== "object" || rule === null) {
    return null;
  }
  return Object.keys(rule as Record<string, unknown>);
}

/** First matcher-clause key list, for a one-line rule summary (mirrors the
 *  simulator's ruleLabel — all clauses, no "which one matters" judgment
 *  since neither caller has a dependency to evaluate against). */
export function summarizeRuleSelectors(rule: unknown): string {
  const keys = ruleKeys(rule);
  if (!keys) {
    return "(not an object)";
  }
  const selectors = keys.filter((k) => k.startsWith("match") || k.startsWith("exclude"));
  return selectors.length > 0 ? selectors.join(" + ") : "(no match*/exclude* selectors)";
}

/**
 * The options a rule WRITES: everything that is neither a selector nor the
 * rule's own prose. Roadmap 069's digest pairs this with the selector summary
 * so a user rule reads `matchUpdateTypes → minimumReleaseAge` — the mockup's
 * "major → minimumReleaseAge 14 days" note, without inventing values the
 * derivation cannot honestly render as one line.
 */
export function ruleWrittenKeys(rule: unknown): string[] {
  const keys = ruleKeys(rule);
  if (!keys) {
    return [];
  }
  return keys.filter(
    (k) => k !== "description" && !k.startsWith("match") && !k.startsWith("exclude"),
  );
}
