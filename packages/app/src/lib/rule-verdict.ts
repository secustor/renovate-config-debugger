import type { ClauseEvaluation, RuleEvaluation } from "@renovate-config-debugger/engine";

/**
 * How a rule's verdict is CLASSIFIED, as opposed to how it is rendered.
 *
 * Hoisted out of `features/simulator/rule-format.ts` (roadmap 048's rule: the
 * shared layer must not import a feature, so a derivation both the app and
 * `packages/cli` need lives here). The rules-drawer badge, the drawer's verdict
 * filter and `rcd simulate --verdict` all have to split a fail-closed
 * "no match — input not set" from a genuine mismatch with ONE predicate — a row
 * filtered as "no input" that then says "no match" is the exact confusion
 * Replay-02 R3/R4 was about, and it would be worse across two surfaces.
 */

/** The clause states that fail a rule (as opposed to the neutral
 *  not-applicable / not-simulated, which decide nothing). */
function failingClauses(clauses: ClauseEvaluation[]): ClauseEvaluation[] {
  return clauses.filter(
    (c) => c.state === "no-match" || c.state === "no-input" || c.state === "error",
  );
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
