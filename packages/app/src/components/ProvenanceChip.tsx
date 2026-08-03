import type { ProvenanceLayer } from "@renovate-config-visualizer/engine";
import { Explained } from "./glossary";
import { layerClass, layerLabel, provenanceGlossaryEntry } from "./provenance-layer";

/**
 * Roadmap 013: the layer-provenance chip introduced by the effective config
 * panel (005) — `repo config` / `global config` / `inherited config` / a
 * preset name, color-coded, clickable to select the contributing preset node
 * in the resolution tree. Factored out so the simulator's rule rows and
 * `packageRules` entries (013) can show the exact same chip instead of a
 * near-duplicate.
 *
 * Roadmap 047: every chip also carries the shared glossary hover card (016
 * machinery) explaining the config levels — `repo config` was being misread
 * as the docs' Repository-vs-Self-hosted option tier, and the label itself
 * stays put, so the card is what disambiguates it.
 */

export function ProvenanceChip({
  layer,
  onSelectPreset,
  variant = "chip",
}: {
  layer: ProvenanceLayer;
  onSelectPreset?: (nodeId: string) => void;
  /**
   * Roadmap 053: inside an evidence layer the same chip repeats on every row,
   * where it is a column of colored labels competing with the evidence itself.
   * `dot` keeps the hue (the thing a reader scans for) and hands the label to
   * the hover card and the tooltip, which is where a reader who cares looks
   * anyway. Writer lines — where the layer is part of the sentence — keep the
   * full chip.
   */
  variant?: "chip" | "dot";
}) {
  const clickable = layer.kind === "preset" && onSelectPreset;
  const dot = variant === "dot";
  const label = layerLabel(layer);
  const className = dot ? `prov-dot ${layerClass(layer)}` : `badge prov-layer ${layerClass(layer)}`;
  const entry = provenanceGlossaryEntry(layer);
  return (
    <Explained entry={entry}>
      {(handlers) =>
        clickable ? (
          // Not necessarily a <button>: callers may render this inside their
          // own row-toggle button, and buttons cannot nest — stopPropagation
          // keeps the row from toggling too.
          <span
            role="button"
            tabIndex={0}
            className={className}
            title={dot ? label : undefined}
            aria-label={dot ? label : undefined}
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
            {...handlers}
          >
            {dot ? null : label}
          </span>
        ) : (
          <span
            className={className}
            tabIndex={0}
            title={dot ? label : undefined}
            aria-label={dot ? label : undefined}
            {...handlers}
          >
            {dot ? null : label}
          </span>
        )
      }
    </Explained>
  );
}
