import { ProvenanceChip } from "@/components/ProvenanceChip";
import type { PinRuleRef } from "./pin-outcome";
import type { RuleDescriptionNote } from "./rule-descriptions";
import { RuleDescriptionQuote } from "./RuleDescriptionQuote";

/**
 * Roadmap 075 (iteration 6): the rules a pin card names, in the simulator's own
 * cross-link grammar — `packageRules[N]` (a link into the editor when the rule
 * is one the reader wrote), the clause label that says what it checks and which
 * clause decided it (`ruleLabel`), the provenance chip that opens the preset
 * that contributed it, and — on a matched rule that has one — its author's own
 * description.
 */

function PinRuleRow({
  rule,
  description,
  onSelectPreset,
  onJumpToEditor,
}: {
  rule: PinRuleRef;
  description?: RuleDescriptionNote;
  onSelectPreset?: (nodeId: string) => void;
  onJumpToEditor?: (repoIndex: number) => void;
}) {
  const repoIndex = rule.repoIndex;
  const jumpable = repoIndex !== undefined && onJumpToEditor !== undefined;
  return (
    <div className="pin-rule">
      {jumpable ? (
        <button
          type="button"
          className="btn-quiet pin-rule-index"
          onClick={() => onJumpToEditor(repoIndex)}
        >
          packageRules[{rule.index}]
        </button>
      ) : (
        <code className="pin-rule-index">packageRules[{rule.index}]</code>
      )}
      <span className="pin-rule-label">{rule.label}</span>
      {rule.layer ? <ProvenanceChip layer={rule.layer} onSelectPreset={onSelectPreset} /> : null}
      {description ? <RuleDescriptionQuote note={description} /> : null}
    </div>
  );
}

export function PinRuleList({
  title,
  rules,
  descriptions,
  onSelectPreset,
  onJumpToEditor,
}: {
  title: string;
  rules: PinRuleRef[];
  /** Roadmap 069: quoted on matched rows only — the list that passes none is
   *  the failed one, where a sentence explains a rule that did nothing. */
  descriptions?: Map<number, RuleDescriptionNote>;
  onSelectPreset?: (nodeId: string) => void;
  onJumpToEditor?: (repoIndex: number) => void;
}) {
  return (
    <div className="pin-rules">
      <p className="pin-rules-title">{title}</p>
      {rules.map((rule) => (
        <PinRuleRow
          key={rule.index}
          rule={rule}
          description={descriptions?.get(rule.index)}
          onSelectPreset={onSelectPreset}
          onJumpToEditor={onJumpToEditor}
        />
      ))}
    </div>
  );
}
