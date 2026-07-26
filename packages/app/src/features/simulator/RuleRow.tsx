import { useEffect, useState } from "react";
import type {
  ClauseEvaluation,
  MergedKey,
  ProvenanceLayer,
  RuleEvaluation,
} from "@renovate-config-visualizer/engine";
import { CopyMarkdownButton } from "@/components/CopyMarkdownButton";
import { OptionKey } from "@/components/option-docs";
import { ProvenanceChip } from "@/components/ProvenanceChip";
import {
  clauseExplanation,
  clauseIcon,
  previewValue,
  ruleAppliedMarkdown,
  ruleLabel,
  VERDICT_LABEL,
} from "./rule-format";

/** Roadmap 006/040: a rule's clause-by-clause evidence — one row per `match*`
 *  selector, with the value it was compared against and why it did or didn't
 *  match. */
function SimClauseList({ clauses }: { clauses: ClauseEvaluation[] }) {
  return (
    <ul className="sim-clauses">
      {clauses.map((clause) => (
        <li key={clause.key} className={`sim-clause state-${clause.state}`}>
          <span className="sim-clause-icon">{clauseIcon(clause.state)}</span>
          <span className="sim-clause-text">
            <code>{clause.key}</code>: {previewValue(clause.value, 60)} —{" "}
            {clauseExplanation(clause)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** One `key: before → after` row of what a matching rule applied. */
function MergedKeyRow({ merged }: { merged: MergedKey }) {
  return (
    <li>
      <span className="sim-merged-key">
        <OptionKey name={merged.key} flagUnknown />
      </span>
      {"before" in merged ? (
        <>
          {" "}
          <span className="sim-merged-before">{previewValue(merged.before)}</span> →{" "}
        </>
      ) : (
        " → "
      )}
      <span className="sim-merged-after">{previewValue(merged.after)}</span>
    </li>
  );
}

/** Roadmap 018/040: what a matching rule applied to the dependency config, as
 *  `key: before → after` rows plus the copy-as-markdown export of the same. */
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
      <ul>
        {merged.map((m) => (
          <MergedKeyRow key={m.key} merged={m} />
        ))}
      </ul>
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
            <SimClauseList clauses={rule.clauses} />
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
