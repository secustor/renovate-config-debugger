import type { RuleAttribution } from "@renovate-config-debugger/engine";

/**
 * The two `packageRules[N]` index schemes, and the map between them.
 *
 * Renovate's validator writes an index into its message text (`packageRules[1]:
 * …`) and which array that index addresses depends on WHAT was validated: the
 * repo's own directly-authored config, or the fully merged one. Roadmap 013
 * made that reference clickable in `RuleMessage`; roadmap 071 hoisted the
 * index arithmetic out of the component, because `rcd validate` and the MCP
 * server have to quote the SAME number the app renders — a second spelling of
 * this mapping would be a second answer to the same question.
 *
 * Pure and DOM-free, hence `lib/`, and exported through `lib/headless.ts`.
 */

/**
 * A `packageRules[N]` reference inside a message, kept as a REGEX rather than
 * `parseConfigPath`: the message is prose CONTAINING a path, not a path. The
 * first match is deliberately the one that wins — for a nested reference like
 * `packageRules[0].packageRules[2]` the top-level index is the one both
 * schemes below are defined against. (`parseConfigPath` stays the right tool
 * for `suggestFix`, which is handed a bare path.)
 */
const RULE_INDEX_RE = /packageRules\[(\d+)\]/;

/**
 * `"repo"` = the message came from validating the repo's own directly-authored
 * config (pre-preset-merge) — e.g. the top-level validate stage.
 * `"merged"` = the message came from validating the fully-merged
 * `finalConfig.packageRules` — e.g. the simulator's own validateConfig echo.
 */
export type RuleMessageIndexKind = "repo" | "merged";

/** Where a message's `packageRules[N]` reference sits, and which N it names. */
export interface RuleIndexReference {
  index: number;
  /** The matched text, e.g. `packageRules[1]` — what a caller linkifies. */
  text: string;
  /** Offsets of `text` in the message, for splitting it around the link. */
  start: number;
  end: number;
}

export function ruleIndexInMessage(message: string): RuleIndexReference | undefined {
  const match = RULE_INDEX_RE.exec(message);
  if (!match || match.index === undefined) {
    return undefined;
  }
  const text = match[0];
  return {
    index: Number(match[1]),
    text,
    start: match.index,
    end: match.index + text.length,
  };
}

/** The other index for a given one, only when it is attributable to the repo layer
 *  (a preset-sourced rule has no repo-config index to annotate with). */
export function crossRuleIndex(
  indexKind: RuleMessageIndexKind,
  index: number,
  ruleAttribution: readonly RuleAttribution[] | null | undefined,
): number | undefined {
  if (!ruleAttribution) {
    return undefined;
  }
  if (indexKind === "repo") {
    return ruleAttribution.find((a) => a.layer.kind === "repo" && a.sourceIndex === index)?.index;
  }
  const entry = ruleAttribution.find((a) => a.index === index);
  return entry?.layer.kind === "repo" ? entry.sourceIndex : undefined;
}
