import type { ProvenanceLayer, RuleEvaluation } from "@renovate-config-debugger/engine";
import { layerId, layerLabel } from "@/components/provenance-layer";

/** Roadmap 047: the matched rules grouped by the provenance layer that
 *  contributed them — the rules drawer's badge row ("config:recommended ×1 ·
 *  repo config ×1"), computed from the same 013 attribution the rule rows
 *  already wear. */
export interface LayerMatchCount {
  layer: ProvenanceLayer;
  count: number;
}

export function matchedLayerCounts(
  rules: RuleEvaluation[],
  layerByIndex: Map<number, ProvenanceLayer>,
): LayerMatchCount[] {
  const byLayer = new Map<string, LayerMatchCount>();
  for (const rule of rules) {
    if (rule.verdict !== "matched") {
      continue;
    }
    const layer = layerByIndex.get(rule.index);
    if (!layer) {
      continue;
    }
    const id = layerId(layer);
    const entry = byLayer.get(id);
    if (entry) {
      entry.count += 1;
    } else {
      byLayer.set(id, { layer, count: 1 });
    }
  }
  return [...byLayer.values()].toSorted(
    (a, b) => b.count - a.count || layerLabel(a.layer).localeCompare(layerLabel(b.layer)),
  );
}
