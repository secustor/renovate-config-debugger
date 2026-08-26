import type { ProvenanceLayer, RuleEvaluation } from "@renovate-config-debugger/engine";
import { type LayerTally, tallyRulesByLayer } from "@/lib/provenance-layer";

/** Roadmap 047: the matched rules grouped by the provenance layer that
 *  contributed them — the rules drawer's badge row ("config:recommended ×1 ·
 *  repo config ×1"), computed from the same 013 attribution the rule rows
 *  already wear. */
export type LayerMatchCount = LayerTally;

/**
 * The grouping and the ordering are `tallyRulesByLayer`'s — shared with the
 * preset filter's option list, which is read right beside this badge row and
 * must not order its layers differently. All this adds is the question: only
 * rules that actually MATCHED contribute a badge.
 */
export function matchedLayerCounts(
  rules: RuleEvaluation[],
  layerByIndex: Map<number, ProvenanceLayer>,
): LayerMatchCount[] {
  return tallyRulesByLayer(rules, layerByIndex, (rule) => rule.verdict === "matched");
}
