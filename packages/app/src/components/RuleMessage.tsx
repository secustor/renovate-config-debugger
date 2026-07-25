import type { RuleAttribution, ValidationMessage } from "@renovate-config-visualizer/engine";

/**
 * Roadmap 013: one canonical rule presentation + cross-links. A validation
 * message from Renovate's own validator embeds an index the app cannot
 * change (`packageRules[N]`) — this component makes that reference clickable
 * (jumping to the editor line or the simulator row, depending which index
 * scheme the message uses) and, when the mapping is determinable via
 * `computeRuleProvenance`, appends the OTHER index as a second clickable
 * annotation: "repo-config index 1 = merged rule 713".
 */

const RULE_INDEX_RE = /packageRules\[(\d+)\]/;

/**
 * `"repo"` = the message came from validating the repo's own directly-authored
 * config (pre-preset-merge) — e.g. the top-level validate stage.
 * `"merged"` = the message came from validating the fully-merged
 * `finalConfig.packageRules` — e.g. the simulator's own validateConfig echo.
 */
export type RuleMessageIndexKind = "repo" | "merged";

/** The other index for a given one, only when it is attributable to the repo layer
 *  (a preset-sourced rule has no repo-config index to annotate with). */
function crossIndex(
  indexKind: RuleMessageIndexKind,
  index: number,
  ruleAttribution: RuleAttribution[] | null | undefined,
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

export function RuleMessage({
  message,
  indexKind,
  ruleAttribution,
  onJumpToEditor,
  onJumpToSimRule,
}: {
  message: ValidationMessage;
  indexKind: RuleMessageIndexKind;
  ruleAttribution: RuleAttribution[] | null | undefined;
  /** Jumps the config editor to the repo-config `packageRules[repoIndex]` line. */
  onJumpToEditor?: (repoIndex: number) => void;
  /** Scrolls to / highlights the simulator's merged-index rule row. */
  onJumpToSimRule?: (mergedIndex: number) => void;
}) {
  const match = RULE_INDEX_RE.exec(message.message);
  if (!match || match.index === undefined) {
    // No rule reference to linkify — the message renders as plain text.
    return message.message;
  }
  const index = Number(match[1]);
  const start = match.index;
  const end = start + match[0].length;
  const before = message.message.slice(0, start);
  const after = message.message.slice(end);
  const cross = crossIndex(indexKind, index, ruleAttribution);

  return (
    <>
      {before}
      <button
        type="button"
        className="rule-ref-link"
        onClick={() => (indexKind === "repo" ? onJumpToEditor?.(index) : onJumpToSimRule?.(index))}
        title={
          indexKind === "repo"
            ? "Jump to this rule in the editor"
            : "Jump to this rule in the simulator's rule list"
        }
      >
        {match[0]}
      </button>
      {after}
      {cross !== undefined ? (
        <button
          type="button"
          className="rule-ref-link rule-ref-cross"
          onClick={() =>
            indexKind === "repo" ? onJumpToSimRule?.(cross) : onJumpToEditor?.(cross)
          }
          title={
            indexKind === "repo"
              ? "Jump to this rule in the simulator's rule list"
              : "Jump to this rule in the editor"
          }
        >
          {indexKind === "repo"
            ? ` (= merged rule packageRules[${cross}] in the simulator)`
            : ` (repo-config index ${cross})`}
        </button>
      ) : null}
    </>
  );
}
