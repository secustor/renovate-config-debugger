import type { ProvenanceLayer } from "@renovate-config-debugger/engine";
import type { GlossaryEntry } from "@/data/glossary-data";

/**
 * Naming/classing helpers for a provenance layer (005/013). They live next to
 * `ProvenanceChip` rather than inside it because callers use them without
 * rendering a chip — the effective config's layer filter, the rule-framing
 * summary — and a component module that also exports plain functions breaks
 * Fast Refresh (react/only-export-components).
 */

export type LayerId = string;

/** Stable id for a layer, used by dropdown filters + winning-badge classes.
 *  NAME-based, so two `extends` entries resolving to the same preset are one
 *  id — deliberate for a filter ("show me what `config:recommended` did"),
 *  wrong wherever the two occurrences must stay apart: see {@link layerNodeKey}. */
export function layerId(layer: ProvenanceLayer): LayerId {
  return layer.kind === "preset" ? `preset:${layer.name}` : layer.kind;
}

/**
 * Identity of the layer as a NODE rather than a name: two `extends` entries
 * resolving to the same preset are two keys, because preset node ids are
 * unique across the tree. Used wherever conflating them would merge two things
 * the reader must see as two — the effective config's override-chain rows, the
 * description digest's per-extend grouping.
 *
 * Not a React key and not a persistable id: node ids are regenerated on every
 * run (`p1`, `p2`, …), so the same string means a different preset after the
 * next keystroke. `layerId` is the stable-across-runs one.
 */
export function layerNodeKey(layer: ProvenanceLayer): string {
  return layer.kind === "preset" ? `preset:${layer.nodeId}` : layer.kind;
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

/** Renovate's config merge order — later levels win. Shared by every
 *  provenance chip's hover card so the four base levels are always presented
 *  the same way, regardless of which one the chip itself names. */
const MERGE_ORDER = "default → global config → inherited config → repo config";

function layerOpeningLine(layer: ProvenanceLayer): string {
  if (layer.kind === "defaults") {
    return "Renovate's built-in defaults — the settings every run starts from before anything else is merged in.";
  }
  if (layer.kind === "global") {
    return "The self-hosted bot's own config. Options set here are ones this repo cannot override.";
  }
  if (layer.kind === "inherited") {
    return "The org-wide config this repo's bot loads automatically, ahead of the repo's own settings.";
  }
  if (layer.kind === "repo") {
    return "Written in this repository's own renovate.json — the editor pane on the left.";
  }
  return `Pulled in by the ${layer.name} preset, resolved from whichever config level's extends brought it in.`;
}

/**
 * Roadmap 047: the glossary hover card shown by every `ProvenanceChip`,
 * explaining which config level contributed the rule/option and where that
 * level sits in Renovate's merge order. Built per-render (rather than a
 * static `GLOSSARY` entry) because preset chips need the preset's own name —
 * the same "spread a dynamic value into a GlossaryEntry" pattern PresetTree
 * already uses for its "duplicate ×N" badge.
 */
export function provenanceGlossaryEntry(layer: ProvenanceLayer): GlossaryEntry {
  const label = layerLabel(layer);
  const opening = layerOpeningLine(layer);
  // For the four base levels, `label` is always the exact substring
  // `MERGE_ORDER` spells that level out with — mark it "(this level)" in
  // place. Preset chips don't map onto one of the four, so they get the
  // plain list plus their own click affordance instead.
  const order =
    layer.kind === "preset"
      ? `Merge order (later levels win): ${MERGE_ORDER}. Click this chip to open the preset in the resolution tree.`
      : `Merge order (later levels win): ${MERGE_ORDER.replace(label, `${label} (this level)`)}.`;
  return {
    name: `${label} — where this rule comes from`,
    plain: `${opening} ${order}`,
  };
}
