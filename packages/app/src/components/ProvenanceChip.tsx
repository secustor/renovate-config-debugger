import type { ProvenanceLayer } from "@renovate-config-visualizer/engine";
import { layerClass, layerLabel } from "./provenance-layer";

/**
 * Roadmap 013: the layer-provenance chip introduced by the effective config
 * panel (005) — `repo config` / `global config` / `inherited config` / a
 * preset name, color-coded, clickable to select the contributing preset node
 * in the resolution tree. Factored out so the simulator's rule rows and
 * `packageRules` entries (013) can show the exact same chip instead of a
 * near-duplicate.
 */

export function ProvenanceChip({
  layer,
  onSelectPreset,
}: {
  layer: ProvenanceLayer;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const clickable = layer.kind === "preset" && onSelectPreset;
  const className = `badge prov-layer ${layerClass(layer)}`;
  if (clickable) {
    // Not necessarily a <button>: callers may render this inside their own
    // row-toggle button, and buttons cannot nest — stopPropagation keeps the
    // row from toggling too.
    return (
      <span
        role="button"
        tabIndex={0}
        className={className}
        title="Show this preset in the resolution tree"
        onClick={(e) => {
          e.stopPropagation();
          onSelectPreset(layer.nodeId);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            onSelectPreset(layer.nodeId);
          }
        }}
      >
        {layerLabel(layer)}
      </span>
    );
  }
  return <span className={className}>{layerLabel(layer)}</span>;
}
