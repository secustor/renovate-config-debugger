import { useMemo, useState } from "react";
import type { ProvenanceLayer, SimulationResult } from "@renovate-config-debugger/engine";
import { ProvenanceChip } from "@/components/ProvenanceChip";
import { nf } from "@/lib/format";
import { ClauseGrid } from "./ClauseGrid";
import { MAX_PROBE_HITS, type ProbeHit, probeRules, probeSuggestions } from "./pin-probe";
import type { RuleDescriptionNote } from "./rule-descriptions";
import { ruleRef } from "@/lib/rule-ref";

/**
 * The funnel's probe input (Proposal F / "Skip Reason Funnel") — "why didn't a
 * rule apply to this test?" as a search across everything a reader knows a
 * rule by. The search itself is `pin-probe.ts`; this file only decides what is
 * on screen: the idle suggestions, the hit list with its found-in highlight,
 * and the matcher checklist a clicked hit opens.
 *
 * The query is the PARENT's state, not this component's: a bucket row's
 * "probe" button is the other writer.
 */

function ProbeIdle({
  suggestions,
  onFill,
}: {
  suggestions: string[];
  onFill: (query: string) => void;
}) {
  return (
    <div className="pin-probe-idle">
      <p className="pin-probe-idle-lead">
        Answers “why didn’t a rule apply to this test?” — probing pins nothing. Start typing, or
        try:
      </p>
      <div className="pin-probe-chips">
        {suggestions.map((label) => (
          <button key={label} type="button" className="btn-chip" onClick={() => onFill(label)}>
            {label}
          </button>
        ))}
      </div>
      <p className="pin-probe-idle-note">
        Matches rule indexes, preset names, matcher values, and options rules write.
      </p>
    </div>
  );
}

function ProbeHitSummary({
  hit,
  onSelectPreset,
}: {
  hit: ProbeHit;
  onSelectPreset?: (nodeId: string) => void;
}) {
  return (
    <>
      <span className={`pin-section-mark ${hit.matched ? "mark-ok" : "mark-error"}`}>
        {hit.matched ? "✓" : "✗"}
      </span>
      <code className="pin-probe-hit-ref">{ruleRef(hit.index)}</code>
      {hit.layer?.kind === "preset" ? (
        <ProvenanceChip layer={hit.layer} onSelectPreset={onSelectPreset} />
      ) : null}
      <span className="pin-probe-found">
        found in <code>{hit.foundIn}</code>:
      </span>
      <span className="pin-probe-context">
        {hit.pre}
        <mark>{hit.hit}</mark>
        {hit.post}
      </span>
    </>
  );
}

function ProbeHitRow({
  hit,
  subject,
  open,
  onToggle,
  onSelectPreset,
}: {
  hit: ProbeHit;
  subject: string;
  open: boolean;
  onToggle: () => void;
  onSelectPreset?: (nodeId: string) => void;
}) {
  return (
    <div className="pin-probe-hit">
      <button type="button" className="pin-probe-hit-line" aria-expanded={open} onClick={onToggle}>
        <ProbeHitSummary hit={hit} onSelectPreset={onSelectPreset} />
      </button>
      {open ? (
        <div className="pin-evidence">
          <p className="pin-evidence-title">
            {hit.matched ? `Why it matched ${subject}` : `Why it didn’t apply to ${subject}`}
          </p>
          <ClauseGrid clauses={hit.clauses} />
        </div>
      ) : null}
    </div>
  );
}

function ProbeResultList({
  hits,
  total,
  query,
  subject,
  onSelectPreset,
}: {
  hits: ProbeHit[];
  total: number;
  query: string;
  subject: string;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <div className="pin-probe-results">
      <p className="pin-probe-results-head">
        {nf.format(total)} {total === 1 ? "rule matches" : "rules match"} “{query}”
        {total > hits.length ? ` — showing the first ${MAX_PROBE_HITS}` : ""} — each row shows where
        it was found
      </p>
      {hits.map((hit) => (
        <ProbeHitRow
          key={hit.index}
          hit={hit}
          subject={subject}
          open={openIndex === hit.index}
          onToggle={() => setOpenIndex(openIndex === hit.index ? null : hit.index)}
          onSelectPreset={onSelectPreset}
        />
      ))}
      <p className="pin-probe-results-foot">
        Probing pins nothing — it answers “why didn’t this rule apply here” for the current test
        only. Click a row for its matcher checklist.
      </p>
    </div>
  );
}

export function PinProbe({
  sim,
  layerByIndex,
  descriptions,
  ruleBodies,
  subject,
  query,
  onQueryChange,
  onSelectPreset,
}: {
  sim: SimulationResult;
  layerByIndex: Map<number, ProvenanceLayer>;
  descriptions: Map<number, RuleDescriptionNote>;
  /** `finalConfig.packageRules` — makes each rule's writes searchable. */
  ruleBodies?: readonly unknown[];
  /** What the checklist title calls the test — `react · npm · minor`. */
  subject: string;
  query: string;
  onQueryChange: (query: string) => void;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const trimmed = query.trim();
  const results = useMemo(
    () => probeRules({ sim, layerByIndex, descriptions, ruleBodies, query }),
    [sim, layerByIndex, descriptions, ruleBodies, query],
  );
  const suggestions = useMemo(() => probeSuggestions(sim, layerByIndex), [sim, layerByIndex]);
  return (
    <div className="pin-probe">
      <label className="pin-probe-label">
        <span>
          Probe any rule — fuzzy search across indexes, preset names, matcher values, and rule
          descriptions:
        </span>
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="e.g. 203, angular, groupName, automerge"
          spellCheck={false}
        />
      </label>
      {trimmed === "" ? <ProbeIdle suggestions={suggestions} onFill={onQueryChange} /> : null}
      {trimmed !== "" && results.total > 0 ? (
        <ProbeResultList
          hits={results.hits}
          total={results.total}
          query={trimmed}
          subject={subject}
          onSelectPreset={onSelectPreset}
        />
      ) : null}
      {trimmed !== "" && results.total === 0 ? (
        <p className="pin-probe-empty">
          No rule mentions “{trimmed}” in its index, preset, matchers, or written options.
        </p>
      ) : null}
    </div>
  );
}
