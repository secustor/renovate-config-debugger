import type { DescriptionProvenance } from "@renovate-config-debugger/engine";
import { approximateTitle } from "@/components/description-approx";
import { ROOT_NODE_ID } from "@/components/preset-tree-stats";
import { dropReasonText } from "./drop-reasons";

/**
 * Roadmap 069 (PR 4): the preset tree's `describe` mode, as data.
 *
 * The Overview digest (PR 2) regroups the sentences by what each `extends`
 * bought, and the Effective config's blame ledger (PR 3) keeps the final
 * array's own order. This is the third reading of the same attribution and the
 * only one that answers the question BY PLACEMENT: what does THIS node say?
 * The text appears where it was written, so the tree stops being 1,088 cryptic
 * preset names and becomes skimmable prose.
 *
 * Everything here is a single pass over `entries` + `dropped` — tens of items,
 * never the thousand nodes — inverted into a per-node index the tree looks up
 * by `nodeId`. A node with no description fact is simply absent from the map,
 * which is what keeps describe mode from adding DOM to the ~1,070 nodes that
 * have nothing to say.
 *
 * Pure and DOM-free, so every note's wording is unit-testable and the row
 * components only decide where things sit.
 */

const nf = new Intl.NumberFormat();

/** Where one of a node's sentences landed in the final `description` array.
 *  Rendered in the node's own meta area, next to the contribution badges. */
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
 * `dropped` — one Renovate deleted before it could merge, shown struck through
 * at the node that authored it, which is the only place the drop is visible.
 * `mute` — the note on the node that CAUSED such drops (`ignoreDeps: []`).
 */
export type DescLineKind = "contribution" | "dropped" | "mute";

/**
 * One quote line beneath a node's name row.
 *
 * Pure text, deliberately: the `≈` the other surfaces render (069 PR 2's
 * `ApproximateMark`) qualifies a source CHIP, and this row has none — its
 * placement under the node is the attribution, so a glyph in front of a
 * struck-through quote would read as part of the quotation. The hedge travels as
 * words instead, in the `note` and therefore in the `title` derived from it,
 * which is the only text an ellipsized row can still show. On a contributing
 * node the node's own marker carries the `approx` suffix as well.
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
  /** The row is ellipsized, so the untruncated text is its tooltip —
   *  backticks stripped, since a `title` cannot render `<code>`. */
  title: string;
}

function descLine(key: string, kind: DescLineKind, text: string, note?: string): DescLine {
  const title = [text, note]
    .filter((part) => part)
    .join(" — ")
    .replaceAll("`", "");
  return { key, kind, text, note, title };
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
 * it (`components/description-approx.ts`, 069 PR 2).
 *
 * The nameless form is the right one here even though the enclosing node is
 * known — the line is rendered ON that node's row, so naming it again would
 * repeat the row above it. The `≈` the other surfaces put beside a chip has its
 * counterpart in the marker's own `approx` suffix.
 */
export const APPROXIMATE_NOTE = approximateTitle();

/**
 * Inverts a run's description provenance into the per-node index describe mode
 * renders from, or `null` when no node has a description fact at all (in which
 * case the mode toggle has nothing to offer and is not shown).
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
    // mode toggle appears and describe mode then shows nothing at all.
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
      // The reason comes from the shared table (069 PR 3's `drop-reasons.ts`),
      // which is also what the blame ledger's footer prints — the two surfaces
      // answer "where did my preset's description go" and must answer it
      // identically. It hedges itself for an `approximate` drop, so the caveat
      // reaches the line AND the tooltip `descLine` derives from it.
      factsFor(drop.node.nodeId).lines.push(
        descLine(`x${index}`, "dropped", drop.value, dropReasonText(drop)),
      );
    }
    // …and the mute button that pressed it, which is a different node and the
    // one a reader would actually remove.
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
 * …and its tooltip. `linked` is whether the marker is the cross-link to the
 * blame ledger, which only App-level plumbing can offer.
 *
 * Built as independent sentences rather than one template per case: the slot,
 * the repeat, the hedge and the call to action are four facts a degraded run can
 * carry in any combination, and the hedge is the shared wording, which is
 * already a sentence of its own.
 */
export function positionMarkerTitle(marker: PositionMarker, linked: boolean): string {
  let slot = `Sentence #${marker.position} of ${marker.total} in the final description array`;
  if (marker.duplicateOfPosition !== undefined) {
    slot += ` — a repeat of #${marker.duplicateOfPosition}, which Renovate never deduplicates`;
  }
  const sentences = [slot];
  if (marker.approximate) {
    sentences.push(APPROXIMATE_NOTE);
  }
  if (linked) {
    sentences.push("Show the full array in the Effective config");
  }
  return sentences.map((sentence) => `${sentence}.`).join(" ");
}

/**
 * The other half of a mute's story, on the node that pressed the button —
 * `group:recommended` alone silences a hundred-plus sentences below it.
 *
 * Tree-only, and therefore local: `drop-reasons.ts` words the rule for the node
 * whose sentence went missing, which is the fact both surfaces state. This is an
 * AGGREGATE over the drops of a whole subtree, and it exists because the tree is
 * the only surface with a row for the muting node to say it on — the ledger
 * lists drops, never their causes, so there is no twin to drift from.
 */
export function muteNoteText(count: number): string {
  return `mutes ${nf.format(count)} description${count === 1 ? "" : "s"} below (empty \`ignoreDeps\`)`;
}

/** The card title's count — the reason to reach for describe mode at all. */
export function describeCountText(tree: TreeDescriptions): string {
  const count = tree.contributorCount;
  if (count === 0) {
    return "none contribute descriptions";
  }
  return count === 1
    ? "1 contributes a description"
    : `${nf.format(count)} contribute descriptions`;
}
