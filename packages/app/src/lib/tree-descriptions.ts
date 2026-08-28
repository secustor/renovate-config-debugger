import { nf, plural } from "./format";
import type { DescriptionProvenance } from "@renovate-config-debugger/engine";
import { approximateTitle } from "@/lib/description-approx";
import { ROOT_NODE_ID } from "./preset-tree-stats";

/**
 * Roadmap 069 (PR 4): the preset tree's description surfaces, as data.
 *
 * The Overview digest (PR 2) regroups the sentences by what each `extends`
 * bought, and the Effective config's blame ledger (PR 3) keeps the final
 * array's own order. This is the third reading of the same attribution and the
 * only one that answers the question BY PLACEMENT: what does THIS node say?
 * The answer rides on the node itself — a hover card on the preset's name in
 * the tree, and the Description entry of the detail panel — rather than as a
 * view mode of its own: the tree already has a tree/table switch, and a second
 * switch beside it would be a mode over a handful of nodes.
 *
 * Everything here is a single pass over `entries` + `dropped` — tens of items,
 * never the thousand nodes — inverted into a per-node index the tree looks up
 * by `nodeId`. A node with no description fact is simply absent from the map,
 * which is what keeps the surface from adding DOM to the ~1,070 nodes that
 * have nothing to say.
 *
 * Pure and DOM-free, so every note's wording is unit-testable and the
 * components only decide where things sit.
 */

/** Where one of a node's sentences landed in the final `description` array.
 *  Rendered after the sentence it places, on both description surfaces. */
export interface PositionMarker {
  /** Stable React key within the node (the entry's canonical index). */
  key: string;
  /** 1-based position in the final array — every index this app prints is. */
  position: number;
  /** Members of the final array, non-strings included (the engine's
   *  `finalLength`): the marker names a slot in the array the Effective config
   *  prints, so its denominator has to be that array's real length. */
  total: number;
  /** 1-based position of the first occurrence, when this entry repeats one. */
  duplicateOfPosition?: number;
  /** The engine could only place this string inside the node's SUBTREE. */
  approximate?: boolean;
}

/**
 * `contribution` — a sentence this node wrote that reached the final config.
 * `dropped` — one Renovate deleted before it could merge. On the node itself
 * that is the EXPECTED case, not a problem: every wrapper and package-list
 * preset sheds its description by design, and the sentence is still the
 * preset's best self-description — so it renders plainly (it simply carries no
 * slot marker), and the drop mechanics stay on the blame ledger's footer,
 * where "where did my description go in the final array" is the question.
 * `mute` — the note on the node that CAUSED such drops (`overrideDescription`).
 */
export type DescLineKind = "contribution" | "dropped" | "mute";

/**
 * One line of a node's description card / panel entry.
 *
 * Pure text, deliberately: the `≈` the other surfaces render (069 PR 2's
 * `ApproximateMark`) qualifies a source CHIP, and this line has none — its
 * placement on the node is the attribution, so a glyph in front of a
 * struck-through quote would read as part of the quotation. The hedge travels
 * as words instead, in the `note`. On a contributing node the entry's marker
 * carries the `approx` suffix as well.
 */
export interface DescLine {
  /** Stable React key within the node. */
  key: string;
  kind: DescLineKind;
  /** The sentence itself, backtick-marked (the `CodeText` convention). Empty
   *  for a `mute` line, which is a fact about the node, not a quotation. */
  text: string;
  /** The muted explanation after the text. */
  note?: string;
}

function descLine(key: string, kind: DescLineKind, text: string, note?: string): DescLine {
  return { key, kind, text, note };
}

export interface NodeDescriptionFacts {
  markers: PositionMarker[];
  lines: DescLine[];
}

export interface TreeDescriptions {
  /** Only nodes that have something to say — the lookup returns `undefined`
   *  for every other node, and that is the performance contract. */
  byNodeId: ReadonlyMap<string, NodeDescriptionFacts>;
  /** Distinct preset nodes appearing in `entries` (the repo config excluded). */
  contributorCount: number;
  /** Members of the final `description` array — the engine's `finalLength`. */
  total: number;
}

/**
 * The note on an `approximate` entry: the shared hedge, not a fourth phrasing of
 * it (`lib/description-approx.ts`, 069 PR 2).
 *
 * The nameless form is the right one here even though the enclosing node is
 * known — the line is rendered ON that node's card, so naming it again would
 * repeat the name the card hangs from. The `≈` the other surfaces put beside a
 * chip has its counterpart in the marker's own `approx` suffix.
 */
export const APPROXIMATE_NOTE = approximateTitle();

/**
 * Inverts a run's description provenance into the per-node index the hover
 * cards and the detail panel render from, or `null` when no node has a
 * description fact at all (in which case no name carries a card).
 */
export function buildTreeDescriptions(provenance: DescriptionProvenance): TreeDescriptions | null {
  // The array's REAL length, not `entries.length`: Renovate keeps a non-string
  // member with a warning, so `{"description": ["a", 42, "b"]}` has "b" at #3 of
  // 3 while only two members are attributable (069 PR 1's `unattributed` /
  // `finalLength`). Counting the strings would print "#3 of 2".
  const total = provenance.finalLength;
  const byNodeId = new Map<string, NodeDescriptionFacts>();
  const contributors = new Set<string>();
  /** Drops each node caused below it, keyed by the muting node. */
  const mutes = new Map<string, number>();

  const factsFor = (nodeId: string): NodeDescriptionFacts => {
    const existing = byNodeId.get(nodeId);
    if (existing) {
      return existing;
    }
    const created: NodeDescriptionFacts = { markers: [], lines: [] };
    byNodeId.set(nodeId, created);
    return created;
  };

  for (const entry of provenance.entries) {
    const node = entry.node;
    // Strings from a layer with no preset tree (defaults / global / inherited)
    // have no node to sit on. The ROOT is skipped for the same reason and not
    // merely left out of the count: `flattenTree` starts at the root's
    // CHILDREN, so facts filed under it would never mount — and a run where
    // only the repo config wrote descriptions has to come back `null`, or the
    // title advertises descriptions no name in the tree can show.
    if (!node || node.nodeId === ROOT_NODE_ID) {
      continue;
    }
    contributors.add(node.nodeId);
    const facts = factsFor(node.nodeId);
    facts.markers.push({
      key: `p${entry.index}`,
      position: entry.index + 1,
      total,
      duplicateOfPosition:
        entry.duplicateOfIndex === undefined ? undefined : entry.duplicateOfIndex + 1,
      approximate: entry.approximate,
    });
    facts.lines.push(
      descLine(
        `c${entry.index}`,
        "contribution",
        entry.value,
        entry.approximate ? APPROXIMATE_NOTE : undefined,
      ),
    );
  }

  for (const [index, drop] of provenance.dropped.entries()) {
    // Same rule as above, on both halves of the story: nothing is ever filed
    // under the root, which has no row to show it on.
    if (drop.node.nodeId !== ROOT_NODE_ID) {
      // No drop-reason note here (see `DescLineKind`): on the node's own card
      // the sentence is what the reader wants, and "Renovate drops it on
      // merge" is chrome about an array this surface is not showing. Only the
      // attribution hedge survives — WHO said it can still be a guess.
      factsFor(drop.node.nodeId).lines.push(
        descLine(
          `x${index}`,
          "dropped",
          drop.value,
          drop.approximate ? APPROXIMATE_NOTE : undefined,
        ),
      );
    }
    // …and the mute button that pressed it — usually a different node, and the
    // one a reader would actually remove. An `overrideDescription` replaces the
    // overriding node's OWN sentence too, so the two can be the same node: it
    // then carries both its dropped line and the note.
    const by = drop.droppedBy;
    if (by && by.nodeId !== ROOT_NODE_ID) {
      mutes.set(by.nodeId, (mutes.get(by.nodeId) ?? 0) + 1);
    }
  }

  for (const [nodeId, count] of mutes) {
    factsFor(nodeId).lines.push(descLine("mute", "mute", "", muteNoteText(count)));
  }

  return byNodeId.size === 0 ? null : { byNodeId, contributorCount: contributors.size, total };
}

/** The node's meta marker: `→ #16 of 24`, the tie between a preset and its
 *  slot in the array the Effective config prints. */
export function positionMarkerText(marker: PositionMarker): string {
  // The two suffixes are independent facts and a degraded run can carry both:
  // dropping `approx` for a duplicate would assert a node-to-slot tie the
  // engine only guessed at.
  const parts = [`→ #${nf.format(marker.position)} of ${nf.format(marker.total)}`];
  if (marker.duplicateOfPosition !== undefined) {
    parts.push("duplicate");
  }
  if (marker.approximate) {
    parts.push("approx");
  }
  return parts.join(" · ");
}

/**
 * …and its tooltip. The jump to the blame ledger is no longer advertised here —
 * it is the card's own footer link, a control of its own rather than a promise
 * a `title` makes about a span.
 *
 * Built as independent sentences rather than one template per case: the slot,
 * the repeat and the hedge are three facts a degraded run can carry in any
 * combination, and the hedge is the shared wording, which is already a
 * sentence of its own.
 */
export function positionMarkerTitle(marker: PositionMarker): string {
  let slot = `Sentence #${marker.position} of ${marker.total} in the final description array`;
  if (marker.duplicateOfPosition !== undefined) {
    slot += ` — a repeat of #${marker.duplicateOfPosition}, which Renovate never deduplicates`;
  }
  const sentences = [slot];
  if (marker.approximate) {
    sentences.push(APPROXIMATE_NOTE);
  }
  return sentences.map((sentence) => `${sentence}.`).join(" ");
}

/** A line paired with the marker that places it — contributions only; a
 *  dropped sentence has no slot and a mute note is not a sentence at all. */
export interface DescLineWithMarker {
  line: DescLine;
  marker?: PositionMarker;
}

/**
 * Zips a node's lines with their position markers for rendering. The pairing
 * is positional and safe by construction: `buildTreeDescriptions` pushes a
 * node's contribution lines and its markers from the same loop, in the same
 * order, and only contributions get either.
 */
export function zipDescLines(facts: NodeDescriptionFacts): DescLineWithMarker[] {
  let contribution = 0;
  return facts.lines.map((line) => ({
    line,
    marker: line.kind === "contribution" ? facts.markers[contribution++] : undefined,
  }));
}

/**
 * The other half of a mute's story, on the node that pressed the button —
 * `group:recommended` alone silences a hundred-plus sentences below it.
 *
 * Tree-only, and therefore local: the effective-config feature's
 * `drop-reasons.ts` words the rule for the node
 * whose sentence went missing, which is the fact both surfaces state. This is an
 * AGGREGATE over the drops of a whole subtree, and it exists because the tree is
 * the only surface with a row for the muting node to say it on — the ledger
 * lists drops, never their causes, so there is no twin to drift from.
 */
export function muteNoteText(count: number): string {
  return `mutes ${plural(count, "description")} below (\`overrideDescription\`)`;
}

/** The card title's count — the cue that the tree has descriptions to show. */
export function describeCountText(tree: TreeDescriptions): string {
  const count = tree.contributorCount;
  if (count === 0) {
    return "none contribute descriptions";
  }
  return count === 1
    ? "1 contributes a description"
    : `${nf.format(count)} contribute descriptions`;
}
