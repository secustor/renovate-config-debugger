/**
 * How the app spells a reference to one entry of `packageRules`.
 *
 * The template was written out in about a dozen places across six files — the
 * rule rows, the pin sections, the probe, the merge stops, the evidence card,
 * the thread body, the pin outcome, the overview digest, the validation
 * messages. Each one is trivially right on its own, which is why nobody
 * minded; but the SPELLING is precisely what a reader matches against their own
 * editor and against Renovate's validator output, so it is the kind of string
 * that must not be allowed to become `packageRules #3` in one view and
 * `packageRules[3]` in the next.
 *
 * It lives in `lib/` rather than beside the simulator's other rule formatting
 * because its consumers cross layers: the simulator slice, the OVERVIEW slice
 * (the description digest) and `components/RuleMessage`. A cross-feature import
 * is banned and a shared module may not reach into a feature, so the shared
 * layer is the only place all three can legally read it from.
 */

/** A rule's canonical reference — `packageRules[3]`. */
export function ruleRef(index: number): string {
  return `packageRules[${index}]`;
}

/**
 * Why that index is 0-based, for the `title` of a rule reference.
 *
 * The page counts rules from 1 everywhere else ("3 of 12 rules matched"), so a
 * reference to `packageRules[0]` reads as an off-by-one until this sentence
 * explains it. It was copy-pasted verbatim between the rule row and the
 * evidence card, which are frequently on screen at the same time.
 */
export const RULE_INDEX_TITLE =
  "0-based index — the same numbering Renovate's own validator messages use; the last of N rules is packageRules[N−1]";
