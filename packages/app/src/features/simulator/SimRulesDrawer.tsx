import { memo, type RefObject } from "react";
import type { ProvenanceLayer, RuleEvaluation } from "@renovate-config-debugger/engine";
import { layerId } from "@/lib/provenance-layer";
import { ProvenanceChip } from "@/components/ProvenanceChip";
import { SummaryDrawer } from "./SummaryDrawer";
import { type LayerMatchCount, matchedLayerCounts } from "./layer-counts";
import { filterRules, type RuleFilters } from "@/lib/rule-filters";
import type { RuleDescriptionNote } from "./rule-descriptions";
import { SimRulesBody } from "./SimRulesBody";

/** How many distinct provenance layers the rules drawer names before it
 *  collapses the tail into "+N more" — a config extending a dozen presets
 *  would otherwise turn the summary row into a second rule list. */
const LAYER_BADGE_CAP = 3;

function RuleLayerBadges({
  counts,
  onSelectPreset,
}: {
  counts: LayerMatchCount[];
  onSelectPreset?: (nodeId: string) => void;
}) {
  const shown = counts.slice(0, LAYER_BADGE_CAP);
  const rest = counts.length - shown.length;
  return (
    <>
      {shown.map(({ layer, count }) => (
        <span key={layerId(layer)} className="drawer-badge">
          <ProvenanceChip layer={layer} onSelectPreset={onSelectPreset} />
          <span className="drawer-badge-count">×{count}</span>
        </span>
      ))}
      {rest > 0 ? <span className="drawer-badge-more">+{rest} more</span> : null}
    </>
  );
}

/** Roadmap 047: the rules drawer's computed abstract. "0 of 714 matched" with
 *  no badges beside it IS the no-match state — no separate empty copy. */
function RulesSummary({ matchedCount, totalRules }: { matchedCount: number; totalRules: number }) {
  return (
    <>
      <span className="stat">
        {matchedCount} of {totalRules}
      </span>{" "}
      matched
    </>
  );
}

/**
 * Roadmap 047: the "Matched rules" evidence layer. The list defaults to the
 * rules that actually did something (matched or unresolved), hiding the sea of
 * "no match" rows; the two filter facets (verdict, provenance) are what open
 * it up again — including to the user's own repo-config rules.
 *
 * Roadmap 032: memoized — it filters the whole rule list (hundreds of entries
 * for a preset-heavy config) and every prop it takes comes from the last RUN,
 * not from the live form, so typing in the form must not re-render it.
 */
export const SimRulesDrawer = memo(function SimRulesDrawer({
  rules,
  matchedCount,
  filters,
  onFiltersChange,
  layerByIndex,
  descriptionByIndex,
  onSelectPreset,
  open,
  onToggle,
  detailsRef,
}: {
  rules: RuleEvaluation[];
  matchedCount: number;
  filters: RuleFilters;
  onFiltersChange: (filters: RuleFilters) => void;
  layerByIndex: Map<number, ProvenanceLayer>;
  /** Roadmap 069 (PR 5): the author's description of each described rule. */
  descriptionByIndex?: ReadonlyMap<number, RuleDescriptionNote>;
  onSelectPreset?: (nodeId: string) => void;
  open: boolean;
  onToggle: (open: boolean) => void;
  detailsRef?: RefObject<HTMLDetailsElement | null>;
}) {
  const shownRules = filterRules(rules, filters, layerByIndex);
  const layerCounts = matchedLayerCounts(rules, layerByIndex);
  return (
    <SummaryDrawer
      className="sim-drawer"
      detailsRef={detailsRef}
      title="Matched rules"
      summary={<RulesSummary matchedCount={matchedCount} totalRules={rules.length} />}
      badges={
        layerCounts.length > 0 ? (
          <RuleLayerBadges counts={layerCounts} onSelectPreset={onSelectPreset} />
        ) : undefined
      }
      open={open}
      onToggle={onToggle}
    >
      <SimRulesBody
        rules={rules}
        shownRules={shownRules}
        filters={filters}
        onFiltersChange={onFiltersChange}
        layerByIndex={layerByIndex}
        descriptionByIndex={descriptionByIndex}
        onSelectPreset={onSelectPreset}
      />
    </SummaryDrawer>
  );
});
