import { useEffect, useState } from "react";
import type { MergedKey, ProvenanceLayer, RuleEvaluation } from "@renovate-config-debugger/engine";
import { Caret } from "@/components/Caret";
import { CopyMarkdownButton } from "@/components/CopyMarkdownButton";
import { ExplainedText } from "@/components/glossary";
import { ProvenanceChip } from "@/components/ProvenanceChip";
import { GLOSSARY } from "@/data/glossary-data";
import { isNoInputNoMatch } from "@/lib/rule-verdict";
import { ClauseGrid } from "./ClauseGrid";
import type { RuleDescriptionNote } from "./rule-descriptions";
import { RuleDescriptionQuote } from "./RuleDescriptionQuote";
import { ruleAppliedMarkdown, ruleLabel, ruleVerdictLabel, writeMark } from "./rule-format";
import { WriteRow } from "./WriteRow";

/** Roadmap 018/040/054: what a matching rule applied to the dependency config,
 *  as the shared write rows plus the copy-as-markdown export of the same. */
function SimMergedApplied({ rule, merged }: { rule: RuleEvaluation; merged: MergedKey[] }) {
  return (
    <div className="sim-merged">
      <div className="sim-merged-title">
        Applied to the dependency config
        <CopyMarkdownButton
          className="inline"
          header={`\`packageRules[${rule.index}]\` ${ruleLabel(rule)} — ${ruleVerdictLabel(rule)}`}
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

/**
 * Replay-02 R3/R4: the row's verdict. A no-match decided solely by an unset
 * simulator field wears its own short chip — "no input", in the warn hue its
 * clause glyph already uses — with the distinction spelled out in the hover
 * card beside it, exactly as the provenance chip explains its layer. The full
 * sentence stays in `ruleVerdictLabel`, which is what the markdown export and
 * the evidence card render.
 */
function RuleVerdictBadge({ rule }: { rule: RuleEvaluation }) {
  if (isNoInputNoMatch(rule)) {
    return (
      <ExplainedText
        entry={GLOSSARY.noInput}
        className="badge sim-verdict verdict-no-input explained"
      >
        no input
      </ExplainedText>
    );
  }
  return (
    <span className={`badge sim-verdict verdict-${rule.verdict}`}>{ruleVerdictLabel(rule)}</span>
  );
}

export function RuleRow({
  rule,
  layer,
  description,
  onSelectPreset,
  defaultExpanded = false,
}: {
  rule: RuleEvaluation;
  layer?: ProvenanceLayer;
  /** Roadmap 069 (PR 5): the rule author's own description, when the rule has
   *  one. Quoted only on a MATCHED row — see `RuleDescriptionQuote`. */
  description?: RuleDescriptionNote;
  onSelectPreset?: (nodeId: string) => void;
  /** Roadmap 023: the "my rules only" filter pre-expands its rows' clause evidence. */
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  // Re-sync when the filter toggles (re-expand my-rules rows, collapse otherwise).
  useEffect(() => setExpanded(defaultExpanded), [defaultExpanded]);
  const quote = rule.verdict === "matched" ? description : undefined;
  return (
    // Roadmap 068: a cross-link lands ON this row (`landOnTarget`), so it has
    // to be able to hold focus — the flash marks it for the eye, the focus
    // marks it for the keyboard and for a screen reader.
    <div
      id={`sim-rule-${rule.index}`}
      className={`sim-rule${expanded ? " expanded" : ""}`}
      tabIndex={-1}
    >
      <button
        type="button"
        className="sim-rule-head"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <Caret open={expanded} />
        {/* Roadmap 013: canonical form — the SAME text a validator message and
            the editor cross-link use, so this row is unmistakably the same
            rule as "packageRules[N]" elsewhere on the page. Replay-02 R6: the
            title says WHY it's 0-based next to the page's 1-based counts. */}
        <span
          className="sim-rule-index"
          title="0-based index — the same numbering Renovate's own validator messages use; the last of N rules is packageRules[N−1]"
        >
          packageRules[{rule.index}]
        </span>
        <span className="sim-rule-label">{ruleLabel(rule)}</span>
        <RuleVerdictBadge rule={rule} />
        {layer ? (
          <span className="sim-rule-provenance">
            <ProvenanceChip layer={layer} onSelectPreset={onSelectPreset} />
          </span>
        ) : null}
      </button>
      {/* Outside the head button, and always visible: the sentence is the
          answer to "why does this rule exist", so it must not be behind the
          same disclosure as the clause evidence — and prose inside a button is
          neither selectable nor announced as prose. */}
      {quote ? <RuleDescriptionQuote note={quote} /> : null}
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
