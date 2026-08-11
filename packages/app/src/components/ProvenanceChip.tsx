import type { ProvenanceLayer } from "@renovate-config-debugger/engine";
import { anyModifierHeld } from "@/lib/shortcuts";
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
   * Roadmap 054: inside an evidence layer the same chip repeats on every row,
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
  // `explained` is the app's one "this has a hover card" affordance (016):
  // cursor:help plus an accent lift on hover/focus, the same marking TreeRow
  // and SummaryHeader put on every other card-bearing chip. A clickable chip's
  // own `cursor: pointer` still wins on specificity — pointing at it is a
  // click, not a lookup.
  const className = dot
    ? `prov-dot explained ${layerClass(layer)}`
    : `badge prov-layer explained ${layerClass(layer)}`;
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
            {...handlers}
            // The only anchor in the app that wants BOTH keydown handlers, so
            // it composes them rather than letting the spread pick a winner:
            // the glossary's Escape (068 — it claims the key only when it has a
            // card to dismiss, and never touches these two) and this chip's own
            // activation, which a `role="button"` span has to implement itself.
            onKeyDown={(e) => {
              handlers.onKeyDown(e);
              // Bare Enter/Space only — the same four-modifier guard
              // `openPickerOnEnter` puts on its own Enter, and for the same
              // reason: 068 made ⌘⏎ a page-wide Run, so a hand-rolled
              // activation that ignores modifiers turns the app's primary
              // shortcut into a tab switch and a selected preset node while the
              // results the reader was looking at are replaced. A dropped key
              // would be a nuisance; a different action is a wrong one.
              if (anyModifierHeld(e)) {
                return;
              }
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onSelectPreset(layer.nodeId);
              }
            }}
          >
            {dot ? null : label}
          </span>
        ) : (
          // The dot's label lives in the hover card and the tooltip, so the
          // element itself is a graphic carrying a name — without `role`, a
          // focusable span with an aria-label is a node screen readers have no
          // reason to announce as anything.
          <span
            className={className}
            role={dot ? "img" : undefined}
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
