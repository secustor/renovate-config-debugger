import type { KeyProvenance, ProvenanceLayer } from "@renovate-config-debugger/engine";
import { isPlainObject } from "@renovate-config-debugger/engine/is";
import { isOverridden, type MultiContribBadge, multiContribBadgeKind } from "@/lib/effective-tally";
import { layerLabel } from "@/lib/provenance-layer";
import { winningStep } from "./decider-groups";

/**
 * Roadmap 082: the third cell of an effective-config row — the design's NOTE,
 * in place of the winning-layer chip the band header already states and the
 * one-word badge that used to sit beside it.
 *
 * One row says one thing, so the notes are ordered by how much the reader can
 * act on them: who wrote the lines of a multi-author value, then a value some
 * other layer had already set to exactly this (the redundancy the design tints
 * warn), then how the layers combined when they did not replace one another.
 *
 * Pure and DOM-free — every string here is testable without a render, and the
 * component below only decides where the note sits.
 */

export interface RowNote {
  text: string;
  /** The design's warn tone: something in the run is redundant. */
  warn?: boolean;
  /** The merge behaviour this note is the prose for, when it is one — so the
   *  cell can keep the glossary card the badge used to carry (016/054). */
  badge?: MultiContribBadge;
}

/**
 * Structural equality over the JSON-shaped values a config holds. A local copy
 * of the engine's `deepEqual`: importing the VALUE would pull the renovate
 * chunk into the initial bundle (the same reason `preset-tree-stats` keeps its
 * own `ROOT_NODE_ID`), and this is the whole of it. Only that value import is
 * avoided — the predicate comes from the imports-free `engine/is` subpath.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a);
    return (
      ak.length === Object.keys(b).length &&
      ak.every((k) => Object.hasOwn(b, k) && sameValue(a[k], b[k]))
    );
  }
  return false;
}

/**
 * The layers that set exactly the value the winner did — the repo config
 * repeating what a preset already said, or a preset restating a Renovate
 * default. They are in the chain as ordinary (often no-op) steps; nothing in
 * the view used to read them, so the one fact a reader can act on — "this line
 * changes nothing" — was the one the row did not carry.
 */
export function sameValueLayers(entry: KeyProvenance): ProvenanceLayer[] {
  const winner = winningStep(entry);
  if (!winner) {
    return [];
  }
  const layers: ProvenanceLayer[] = [];
  for (const step of entry.chain) {
    if (step !== winner && sameValue(step.after, winner.after)) {
      layers.push(step.layer);
    }
  }
  return layers;
}

/**
 * The row's note, or `null` for a row where one layer simply set a value.
 *
 * `writers` is the `description` row's own count of contributing presets
 * (`ledgerWriterText`), which no layer chip can express — for a concatenated
 * array the "winning" layer is just the last of twenty-odd presets that each
 * wrote a line, not the one that decided the value.
 */
export function rowNote(entry: KeyProvenance, writers?: string | null): RowNote | null {
  if (writers) {
    return { text: `${writers} wrote these` };
  }
  const overlaps = sameValueLayers(entry);
  const [first, ...rest] = overlaps;
  if (first) {
    const more = rest.length > 0 ? ` +${rest.length} more` : "";
    return { text: `also set by ${layerLabel(first)}${more} — same value`, warn: true };
  }
  if (!isOverridden(entry)) {
    return null;
  }
  const badge = multiContribBadgeKind(entry);
  if (badge === "appended") {
    return { text: "appended, not overridden", badge };
  }
  if (badge === "merged") {
    return { text: "merged, not overridden", badge };
  }
  return { text: "overridden", badge };
}
