import type { RuleAttribution, ValidationMessage } from "@renovate-config-debugger/engine";
import {
  crossRuleIndex,
  type RuleMessageIndexKind,
  ruleIndexInMessage,
} from "@/lib/rule-cross-index";
import { ruleRef } from "@/lib/rule-ref";

/**
 * Roadmap 013: one canonical rule presentation + cross-links. A validation
 * message from Renovate's own validator embeds an index the app cannot
 * change (`packageRules[N]`) — this component makes that reference clickable
 * (jumping to the editor line or the simulator row, depending which index
 * scheme the message uses) and, when the mapping is determinable via
 * `computeRuleProvenance`, appends the OTHER index as a second clickable
 * annotation: "repo-config index 1 = merged rule 713".
 *
 * The index arithmetic itself lives in `lib/rule-cross-index` (roadmap 071):
 * `rcd validate` and the MCP server annotate the same messages, and they must
 * quote the number this component renders rather than restate it.
 */

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
  const reference = ruleIndexInMessage(message.message);
  if (!reference) {
    // No rule reference to linkify — the message renders as plain text.
    return message.message;
  }
  const { index } = reference;
  const before = message.message.slice(0, reference.start);
  const after = message.message.slice(reference.end);
  const cross = crossRuleIndex(indexKind, index, ruleAttribution);

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
        {reference.text}
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
            ? ` (= merged rule ${ruleRef(cross)} in the simulator)`
            : ` (repo-config index ${cross})`}
        </button>
      ) : null}
    </>
  );
}
