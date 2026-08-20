import { nf } from "./format";
import type {
  DescriptionProvenance,
  PresetNode,
  ProvenanceLayer,
} from "@renovate-config-debugger/engine";
import { computeTreeStats, ROOT_NODE_ID } from "./preset-tree-stats";

/**
 * Roadmap 069 (PR 5): attribution at the point of contact — the model behind
 * the hover card on a `description` string in a JSON view.
 *
 * The blame ledger (PR 3) and the Overview digest (PR 2) are places a reader
 * GOES to ask who wrote what. This is the answer where the string already is:
 * hover a sentence in the resolved-config document and the card names the
 * preset that wrote it, the `extends` path it arrived by, and where it sits in
 * the array — the same three facts the ledger prints in three columns, minus
 * the trip.
 *
 * Two things this module owns that the ledger does not need:
 *
 * - **The import path.** `docker:pinDigests` writes "Pin Docker digests." four
 *   levels below the `config:best-practices` the reader actually wrote, and the
 *   chain between them is the answer to "which line do I delete". It comes from
 *   `computeTreeStats`' `parents` map — one cached walk per run, shared with the
 *   tree itself, so a card costs a handful of map lookups.
 * - **The positional guard** (`descriptionCardsFor`). Attribution is by INDEX
 *   into the final `description` array, so it may only be attached to a document
 *   whose `description` IS that array. The Effective config's As-JSON view can
 *   render a keep-internal document (presets still referenced, so most sentences
 *   are absent) or a defaults-hydrated one — neither is index-compatible, and a
 *   card that names the wrong preset is worse than no card. The guard compares
 *   the rendered array against the attribution value for value, at each entry's
 *   REAL index, and hands back `null` on any disagreement. Real, because a
 *   `description` array may legally hold non-strings (Renovate only warns about
 *   `["a", 42]`): they occupy indices no preset wrote, so the cards are not a
 *   1:1 list of the array — they are placed BY index, and the members between
 *   them render plainly.
 *
 * Pure and DOM-free, so every wording is unit-testable.
 */

/**
 * How many path segments a card prints before the middle is elided. The real
 * tree reaches four levels under `config:best-practices` and a hosted org
 * preset adds two more; past this the path stops being a path and becomes a
 * paragraph.
 */
export const PATH_SEGMENT_CAP = 6;

/** The elision marker, and the separator — the tree's own (`TreeRow` elides
 *  router chains with the same two). */
const ELLIPSIS = "…";
const PATH_SEPARATOR = " › ";

/** One string of the final top-level `description`, as its hover card shows it. */
export interface DescriptionCard {
  /** 0-based index into the final `description` array — the canonical id. */
  index: number;
  value: string;
  /** The chip: the preset that wrote it, or the layer it arrived from when no
   *  preset tree node owns it (defaults / global / inherited / the repo's own). */
  layer: ProvenanceLayer;
  /** Root-to-writer `extends` path, already elided; empty when there is no
   *  chain worth printing (a repo-written sentence, or a layer with no tree). */
  path: string[];
  /** 1-based position in the final array — every index this app prints is. */
  position: number;
  total: number;
  /** 1-based position of the first occurrence, when this repeats one. */
  duplicateOfPosition?: number;
  /** The engine could only place this string inside the node's SUBTREE. */
  approximate?: boolean;
  /** `packageRules` the writing preset contributes itself — the other half of
   *  what extending it buys, and free from the tree stats. */
  ownRules?: number;
  /** The writing preset's node id, when the card can offer the tree jump. */
  nodeId?: string;
}

/** Elides the middle of an over-long path, keeping both ends — the ends are
 *  what identify it: the extend the reader wrote, and the preset that wrote
 *  the sentence. */
function elidePath(names: string[]): string[] {
  if (names.length <= PATH_SEGMENT_CAP) {
    return names;
  }
  const head = names.slice(0, 2);
  const tail = names.slice(names.length - (PATH_SEGMENT_CAP - 3));
  return [...head, ELLIPSIS, ...tail];
}

/** Root-to-node name chain, or `[]` when the node is the root itself (or is not
 *  in this run's tree at all — a degraded attribution can name a node the walk
 *  reached through a subtree that the stats map still knows, but the guard
 *  below keeps the honest answer either way). */
function pathTo(tree: PresetNode, nodeId: string): string[] {
  const { nodesById, parents } = computeTreeStats(tree);
  const node = nodesById.get(nodeId);
  if (!node || node.id === ROOT_NODE_ID) {
    return [];
  }
  const names: string[] = [];
  let current: PresetNode | undefined = node;
  // Guarded by the map itself: `parents` is built from one finite walk, so the
  // chain always terminates at the root (which has no parent entry).
  while (current) {
    names.unshift(current.name);
    current = parents.get(current.id);
  }
  return elidePath(names);
}

/**
 * The cards of one run, plus what the positional guard needs to place them: the
 * length of the real final array and which of its indices hold a non-string.
 * Both come straight from the engine's provenance — re-deriving them from the
 * cards would be re-deriving exactly the thing being checked.
 */
export interface DescriptionCards {
  /** One card per ATTRIBUTED string, in array order. Sparser than the array
   *  itself whenever a non-string sits between two sentences — read `index`,
   *  never the position in this list. */
  cards: readonly DescriptionCard[];
  /** Length of the real final `description` array, non-strings included. */
  finalLength: number;
  /** Indices of the members no preset wrote (they are not strings). */
  unattributedIndices: ReadonlySet<number>;
}

/**
 * Builds one card per string of the final `description` array, in that array's
 * order. `cards[i]` is NOT `description[i]` when the array holds a non-string:
 * each card carries its real `index`, which is what the guard below places it
 * by.
 */
export function buildDescriptionCards(
  provenance: DescriptionProvenance,
  tree: PresetNode | null | undefined,
): DescriptionCards {
  const stats = tree ? computeTreeStats(tree) : null;
  // The REAL array's length, so "position 3 of 4" counts the member Renovate
  // kept but nobody wrote — counting only the attributed strings would print a
  // total the reader cannot find in the document in front of them.
  const total = provenance.finalLength;
  const cards = provenance.entries.map((entry): DescriptionCard => {
    // The root is the repo config, not a preset: it wears the `repo config`
    // chip, has no path worth printing and offers no tree jump.
    const preset = entry.node?.nodeId === ROOT_NODE_ID ? undefined : entry.node;
    const ownRules = preset ? stats?.statsById.get(preset.nodeId)?.ownRules : undefined;
    return {
      index: entry.index,
      value: entry.value,
      layer: preset
        ? { kind: "preset", nodeId: preset.nodeId, name: preset.name }
        : entry.viaTopLevel,
      path: preset && tree ? pathTo(tree, preset.nodeId) : [],
      position: entry.index + 1,
      total,
      ...(entry.duplicateOfIndex === undefined
        ? {}
        : { duplicateOfPosition: entry.duplicateOfIndex + 1 }),
      ...(entry.approximate ? { approximate: true } : {}),
      ...(ownRules !== undefined && ownRules > 0 ? { ownRules } : {}),
      // Only a node the tree can actually select.
      ...(preset && stats?.nodesById.has(preset.nodeId) ? { nodeId: preset.nodeId } : {}),
    };
  });
  return {
    cards,
    finalLength: provenance.finalLength,
    unattributedIndices: new Set(provenance.unattributed.map((u) => u.index)),
  };
}

/**
 * The cards for a rendered config document, BY INDEX into that document's
 * `description` array (so a caller printing element `i` asks for `[i]` and gets
 * `undefined` where nothing is attributed) — or `null` when this document's
 * `description` is not the array the attribution indexes: a keep-internal
 * document (presets still referenced), a defaults-hydrated one, or anything
 * else that is not the final config. Matched by POSITION and value, never by
 * value alone: two presets legitimately write the same sentence.
 *
 * The non-string members are checked too, though they never get a card: they
 * are the reason the indices are what they are, so a document that has a
 * SENTENCE where the attribution says a `42` sits is a different array, and
 * accepting it would attribute every later sentence to the wrong preset.
 */
export function descriptionCardsFor(
  doc: unknown,
  attribution: DescriptionCards | null | undefined,
): readonly (DescriptionCard | undefined)[] | null {
  if (!attribution || attribution.cards.length === 0 || typeof doc !== "object" || doc === null) {
    return null;
  }
  const values = (doc as Record<string, unknown>).description;
  if (!Array.isArray(values) || values.length !== attribution.finalLength) {
    return null;
  }
  const byIndex: (DescriptionCard | undefined)[] = Array.from({
    length: attribution.finalLength,
  });
  for (const card of attribution.cards) {
    if (values[card.index] !== card.value) {
      return null;
    }
    byIndex[card.index] = card;
  }
  for (const index of attribution.unattributedIndices) {
    if (typeof values[index] === "string") {
      return null;
    }
  }
  return byIndex;
}

/** The card's head, after the preset chip: `docker:pinDigests` — *wrote this
 *  description*. */
export const WROTE_THIS = "wrote this description";

/** The import path line, mono in the card: `(input config) › config:best-practices
 *  › docker:pinDigests`. Empty string when there is no chain to print, which is
 *  the signal to omit the line. */
export function cardPathText(card: DescriptionCard): string {
  return card.path.length > 1 ? card.path.join(PATH_SEPARATOR) : "";
}

/** The facts line: `Position 16 of 24 · also sets 2 packageRules`, plus the
 *  duplicate call-out when Renovate concatenated this sentence twice. */
export function cardPositionText(card: DescriptionCard): string {
  const parts = [`Position ${nf.format(card.position)} of ${nf.format(card.total)}`];
  if (card.duplicateOfPosition !== undefined) {
    parts.push(`duplicate of #${nf.format(card.duplicateOfPosition)}`);
  }
  if (card.ownRules !== undefined) {
    parts.push(
      `also sets ${nf.format(card.ownRules)} packageRule${card.ownRules === 1 ? "" : "s"}`,
    );
  }
  return parts.join(" · ");
}
