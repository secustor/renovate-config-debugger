import type { ProvenanceLayer } from "@renovate-config-visualizer/engine";

/**
 * Naming/classing helpers for a provenance layer (005/013). They live next to
 * `ProvenanceChip` rather than inside it because callers use them without
 * rendering a chip — the effective config's layer filter, the rule-framing
 * summary — and a component module that also exports plain functions breaks
 * Fast Refresh (react/only-export-components).
 */

export type LayerId = string;

/** Stable id for a layer, used by dropdown filters + winning-badge classes. */
export function layerId(layer: ProvenanceLayer): LayerId {
  return layer.kind === "preset" ? `preset:${layer.name}` : layer.kind;
}

export function layerLabel(layer: ProvenanceLayer): string {
  if (layer.kind === "defaults") {
    return "default";
  }
  if (layer.kind === "global") {
    return "global config";
  }
  if (layer.kind === "inherited") {
    return "inherited config";
  }
  if (layer.kind === "repo") {
    return "repo config";
  }
  return layer.name;
}

export function layerClass(layer: ProvenanceLayer): string {
  return `prov-${layer.kind}`;
}
