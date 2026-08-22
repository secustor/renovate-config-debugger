import { useMemo, useState } from "react";
import type { ProvenanceStep, RuleAttribution } from "@renovate-config-debugger/engine";
import { ConfigJson } from "@/components/ConfigJson";
import { nf } from "@/lib/format";
import { ProvenanceChip } from "@/components/ProvenanceChip";
import { summarizeRuleSelectors } from "@/lib/rule-selectors";

const VERBS: Record<ProvenanceStep["action"], string> = {
  set: "sets",
  overwrite: "overwrites with",
  concat: "appends",
  "shallow-merge": "shallow-merges",
  "deep-merge": "deep-merges",
  forced: "forces",
};

/**
 * One card of the cascade. Roadmap 082 makes every LOSING card's value struck
 * through and muted, whatever the verb: the cards are read as a stack now
 * (winner first), so "this is not the value you got" has to be legible on the
 * card itself rather than inferred from its position. The separate `before`
 * block went with that — the value a layer overwrote is the card BELOW this
 * one, so printing it here rendered the same value twice in one stack.
 */
export function Step({
  step,
  winning,
  onSelectPreset,
}: {
  step: ProvenanceStep;
  /** Roadmap 075 (iteration 5): this step's value is the one in the final
   *  config — the chain's whole point, previously left for the reader to work
   *  out from the position of the last box. */
  winning: boolean;
  onSelectPreset?: (nodeId: string) => void;
}) {
  return (
    <div className={`prov-step action-${step.action}${winning ? " winning" : ""}`}>
      <div className="prov-step-head">
        <ProvenanceChip layer={step.layer} onSelectPreset={onSelectPreset} />
        {/* The defaults layer does not "set" anything — it is what the key was
            before the run began, which is the design's own verb for it. */}
        <span className="prov-step-verb">
          {step.layer.kind === "defaults" ? "defaults to" : VERBS[step.action]}
        </span>
        {step.expandedNested ? (
          <span
            className="badge nested"
            title="Renovate further expanded nested extends inside this value"
          >
            + nested extends
          </span>
        ) : null}
        {winning ? <span className="pill pill-ok prov-step-final">✓ final</span> : null}
      </div>
      <pre className={`config-view prov-value${winning ? "" : " prov-losing"}`}>
        <ConfigJson value={step.after} />
      </pre>
    </div>
  );
}

/** Roadmap 013: per-entry provenance for `packageRules` — which layer (repo /
 *  global / inherited / preset) contributed each merged rule, reusing the
 *  same chip the effective config's top-level keys already show. */
function PackageRulesProvenance({
  rules,
  attribution,
  onSelectPreset,
}: {
  rules: unknown[];
  attribution: RuleAttribution[];
  onSelectPreset?: (nodeId: string) => void;
}) {
  const byIndex = useMemo(() => new Map(attribution.map((a) => [a.index, a])), [attribution]);
  return (
    <div className="prov-rules">
      <div className="prov-rules-title">
        Per-rule provenance ({rules.length} rule{rules.length === 1 ? "" : "s"})
      </div>
      <ul className="prov-rules-list">
        {rules.map((rule, i) => {
          const attr = byIndex.get(i);
          // Roadmap 041 — index key, deliberately: the index IS the identity
          // here. The row renders `packageRules[i]`, displays it as `#i+1` and
          // looks its provenance up by that index; rules never reorder within a
          // render, and rule content is not unique (two identical rules are
          // legal JSON), so nothing else can key this list.
          return (
            // oxlint-disable-next-line react/no-array-index-key -- see above
            <li key={i}>
              <span className="prov-rule-index">#{i + 1}</span>
              {attr ? (
                <ProvenanceChip layer={attr.layer} onSelectPreset={onSelectPreset} />
              ) : (
                <span className="badge prov-layer">source unknown</span>
              )}
              <span className="prov-rule-preview">{summarizeRuleSelectors(rule)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Roadmap 082 (GAP-13): the 463-row table is DEFERRED behind its own line. It
 * is the answer to a question the reader asks about one rule, not the answer to
 * "what is packageRules" — and rendering it eagerly meant expanding the
 * packageRules row pushed the cascade (the thing every other row shows) a
 * thousand pixels down the page.
 *
 * Local state, so collapsing the row forgets it: the deferral is per reading,
 * not a preference.
 */
export function DeferredRuleProvenance({
  rules,
  attribution,
  onSelectPreset,
}: {
  rules: unknown[];
  attribution: RuleAttribution[];
  onSelectPreset?: (nodeId: string) => void;
}) {
  const [shown, setShown] = useState(false);
  if (shown) {
    return (
      <PackageRulesProvenance
        rules={rules}
        attribution={attribution}
        onSelectPreset={onSelectPreset}
      />
    );
  }
  return (
    <p className="prov-rules-defer">
      Per-rule provenance:{" "}
      <button type="button" className="btn-quiet" onClick={() => setShown(true)}>
        {`all ${nf.format(rules.length)} rule${rules.length === 1 ? "" : "s"} with their source preset →`}
      </button>
    </p>
  );
}
