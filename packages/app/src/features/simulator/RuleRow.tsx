import { useEffect, useState } from "react";
import type {
  MergedKey,
  ProvenanceLayer,
  RuleEvaluation,
} from "@renovate-config-visualizer/engine";
import { CopyMarkdownButton } from "@/components/CopyMarkdownButton";
import { ProvenanceChip } from "@/components/ProvenanceChip";
import { ClauseGrid } from "./ClauseGrid";
import { ruleAppliedMarkdown, ruleLabel, VERDICT_LABEL, writeMark } from "./rule-format";
import { WriteRow } from "./WriteRow";

/** Roadmap 018/040/053: what a matching rule applied to the dependency config,
 *  as the shared write rows plus the copy-as-markdown export of the same. */
function SimMergedApplied({ rule, merged }: { rule: RuleEvaluation; merged: MergedKey[] }) {
  return (
    <div className="sim-merged">
      <div className="sim-merged-title">
        Applied to the dependency config
        <CopyMarkdownButton
          className="inline"
          header={`\`packageRules[${rule.index}]\` ${ruleLabel(rule)} — ${VERDICT_LABEL[rule.verdict]}`}
          code={ruleAppliedMarkdown(merged)}
        />
      </div>
      <div className="kv sim-writes">
        {merged.map((m) => (
          <WriteRow
            key={m.key}
            name={m.key}
            mark={writeMark("before" in m, "after" in m)}
            before={"before" in m ? { json: m.before } : undefined}
            after={"after" in m ? { json: m.after } : { text: "removed" }}
          />
        ))}
      </div>
    </div>
  );
}

export function RuleRow({
  rule,
  layer,
  onSelectPreset,
  defaultExpanded = false,
}: {
  rule: RuleEvaluation;
  layer?: ProvenanceLayer;
  onSelectPreset?: (nodeId: string) => void;
  /** Roadmap 023: the "my rules only" filter pre-expands its rows' clause evidence. */
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  // Re-sync when the filter toggles (re-expand my-rules rows, collapse otherwise).
  useEffect(() => setExpanded(defaultExpanded), [defaultExpanded]);
  return (
    <div id={`sim-rule-${rule.index}`} className={`sim-rule${expanded ? " expanded" : ""}`}>
      <button
        type="button"
        className="sim-rule-head"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="caret">{expanded ? "▾" : "▸"}</span>
        {/* Roadmap 013: canonical form — the SAME text a validator message and
            the editor cross-link use, so this row is unmistakably the same
            rule as "packageRules[N]" elsewhere on the page. */}
        <span className="sim-rule-index">packageRules[{rule.index}]</span>
        <span className="sim-rule-label">{ruleLabel(rule)}</span>
        <span className={`badge sim-verdict verdict-${rule.verdict}`}>
          {VERDICT_LABEL[rule.verdict]}
        </span>
        {layer ? (
          <span className="sim-rule-provenance">
            <ProvenanceChip layer={layer} onSelectPreset={onSelectPreset} />
          </span>
        ) : null}
      </button>
      {expanded ? (
        <div className="sim-rule-detail">
          {rule.clauses.length === 0 ? (
            <p className="empty-note">No match* clauses — the rule applies to everything.</p>
          ) : (
            <ClauseGrid clauses={rule.clauses} />
          )}
          {rule.notes.map((note) => (
            <p key={note} className="sim-note">
              {note}
            </p>
          ))}
          {rule.merged && rule.merged.length > 0 ? (
            <SimMergedApplied rule={rule} merged={rule.merged} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
