import type { DescriptionProvenance, DroppedDescription } from "@renovate-config-debugger/engine";

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

/** The repo config's own node id (`trace/preset-tree.ts`). It is the tree's
 *  root and never renders as a row, so its sentences — the user's own — are
 *  excluded from the contributor count the card title prints. */
const ROOT_NODE_ID = "root";

/** Where one of a node's sentences landed in the final `description` array.
 *  Rendered in the node's own meta area, next to the contribution badges. */
export interface PositionMarker {
  /** Stable React key within the node (the entry's canonical index). */
  key: string;
  /** 1-based position in the final array — every index this app prints is. */
  position: number;
  /** Strings in the final array. */
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

/** One quote line beneath a node's name row. */
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
  /** Strings in the final `description` array. */
  total: number;
}

/** The note on an `approximate` entry — the engine's enclosing-node fallback,
 *  said in the tree's own terms. */
export const APPROXIMATE_NOTE =
  "written somewhere inside this preset — the exact one could not be determined";

/**
 * Inverts a run's description provenance into the per-node index describe mode
 * renders from, or `null` when no node has a description fact at all (in which
 * case the mode toggle has nothing to offer and is not shown).
 */
export function buildTreeDescriptions(provenance: DescriptionProvenance): TreeDescriptions | null {
  const total = provenance.entries.length;
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
    // have no node to sit on, and the root's own sentences never render a row.
    if (!node) {
      continue;
    }
    if (node.nodeId !== ROOT_NODE_ID) {
      contributors.add(node.nodeId);
    }
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
    factsFor(drop.node.nodeId).lines.push(
      descLine(`x${index}`, "dropped", drop.value, droppedNoteText(drop)),
    );
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
  const base = `→ #${nf.format(marker.position)} of ${nf.format(marker.total)}`;
  if (marker.duplicateOfPosition !== undefined) {
    return `${base} · duplicate`;
  }
  return marker.approximate ? `${base} · approx` : base;
}

/** …and its tooltip. `linked` is whether the marker is the cross-link to the
 *  blame ledger, which only App-level plumbing can offer. */
export function positionMarkerTitle(marker: PositionMarker, linked: boolean): string {
  const cta = linked ? " Show the full array in the Effective config." : "";
  if (marker.duplicateOfPosition !== undefined) {
    return `Sentence #${marker.position} of ${marker.total} in the final description array — a repeat of #${marker.duplicateOfPosition}, which Renovate never deduplicates.${cta}`;
  }
  if (marker.approximate) {
    return `Landed at #${marker.position} of ${marker.total} in the final description array, ${APPROXIMATE_NOTE}.${cta}`;
  }
  return `Sentence #${marker.position} of ${marker.total} in the final description array.${cta}`;
}

const DROP_NOTES: Record<"wrapper-preset" | "package-list-preset", string> = {
  // Both are `getPreset` deletions, i.e. facts about the preset's SHAPE — and
  // worth saying in the tree, because the two headline presets ARE the shape.
  "wrapper-preset":
    "Renovate drops it on merge — wrapper preset (body is only `description` + `extends`)",
  "package-list-preset":
    "Renovate drops it on merge — package-name list (body only sets `matchPackageNames`)",
};

/** Why this node's own sentence never reached the config. Backtick-marked (the
 *  `CodeText` convention), so option names stay mono. */
export function droppedNoteText(drop: DroppedDescription): string {
  if (drop.reason === "ignore-deps-quirk") {
    const by = drop.droppedBy ? `\`${drop.droppedBy.name}\`` : "the extending config";
    return `muted by ${by} — its empty \`ignoreDeps\` deletes every description it extends`;
  }
  return DROP_NOTES[drop.reason];
}

/** The other half of that story, on the node that pressed the mute button —
 *  `group:recommended` alone silences a hundred-plus sentences below it. */
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
