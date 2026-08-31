import { describe, expect, test } from "vitest";
import type { DescriptionProvenance, DroppedDescription } from "@renovate-config-debugger/engine";
import { approximateTitle } from "@/lib/description-approx";
import {
  APPROXIMATE_NOTE,
  buildTreeDescriptions,
  describeCountText,
  muteNoteText,
  type PositionMarker,
  positionMarkerText,
  positionMarkerTitle,
  type TreeDescriptions,
  zipDescLines,
} from "./tree-descriptions";
import {
  descriptionEntries as entries,
  descriptionProvenance as provenance,
  presetLayer as preset,
} from "@tools/test/description-provenance";

/**
 * Roadmap 069 (PR 4): the per-node index the name hover cards and the detail
 * panel render from, and the wording of every note, over hand-built
 * provenance. The engine's own tests (PR 1) prove the ATTRIBUTION against the
 * real 1,088-preset tree; what needs proving here is the inversion — that a
 * node's facts land on that node, that a drop shows at the preset that
 * authored it while the mute note shows at the one that pressed the button,
 * and that nodes with nothing to say stay absent from the map, which is the
 * surface's whole performance story.
 */

const DASHBOARD = preset("p1", ":dependencyDashboard");
const BEST_PRACTICES = preset("p2", "config:best-practices");

function built(source: DescriptionProvenance): TreeDescriptions {
  const tree = buildTreeDescriptions(source);
  if (!tree) {
    throw new Error("expected a description index");
  }
  return tree;
}

describe("buildTreeDescriptions", () => {
  test("indexes each sentence on the node that wrote it, with its array slot", () => {
    const tree = built(
      provenance({
        entries: entries([
          { value: "Enable Renovate Dependency Dashboard creation.", node: "p1", via: DASHBOARD },
          { value: "Pin Docker digests.", node: "p9", via: BEST_PRACTICES },
        ]),
      }),
    );

    expect(tree.total).toBe(2);
    expect(tree.contributorCount).toBe(2);
    expect(tree.byNodeId.get("p1")?.lines).toEqual([
      {
        key: "c0",
        kind: "contribution",
        text: "Enable Renovate Dependency Dashboard creation.",
        note: undefined,
      },
    ]);
    expect(tree.byNodeId.get("p9")?.markers).toEqual([
      { key: "p1", position: 2, total: 2, duplicateOfPosition: undefined, approximate: undefined },
    ]);
  });

  test("keeps every sentence of a node that wrote several", () => {
    const tree = built(
      provenance({
        entries: entries([
          { value: "First.", node: "p1" },
          { value: "Second.", node: "p1" },
        ]),
      }),
    );

    expect(tree.byNodeId.get("p1")?.lines.map((line) => line.text)).toEqual(["First.", "Second."]);
    expect(tree.byNodeId.get("p1")?.markers.map((m) => m.position)).toEqual([1, 2]);
    // Two sentences, ONE contributor — the count in the card title counts nodes.
    expect(tree.contributorCount).toBe(1);
  });

  test("counts the array's real length, non-strings included", () => {
    // `{"description": ["A", 42, "B"]}` merges with a warning and the `42` holds
    // index 1 (069 PR 1's `unattributed`), so "B" really is #3 of 3. Counting
    // the attributable strings would print "#3 of 2" — a marker that cannot be
    // found in the array the Effective config shows.
    const tree = built(
      provenance({
        entries: entries([
          { value: "A.", node: "p1" },
          { value: "B.", node: "p9", index: 2 },
        ]),
        unattributed: [{ index: 1, value: 42 }],
      }),
    );

    expect(tree.total).toBe(3);
    expect(tree.byNodeId.get("p9")?.markers[0]).toMatchObject({ position: 3, total: 3 });
    expect(positionMarkerText(tree.byNodeId.get("p9")?.markers[0] ?? marker())).toBe("→ #3 of 3");
  });

  test("nodes with no description fact are absent from the map", () => {
    const tree = built(provenance({ entries: entries([{ value: "Only me.", node: "p1" }]) }));

    expect(tree.byNodeId.has("p1")).toBe(true);
    expect(tree.byNodeId.get("p2")).toBeUndefined();
    expect(tree.byNodeId.size).toBe(1);
  });

  test("attributes duplicates to their own occurrence, pointing at the first", () => {
    const tree = built(
      provenance({
        entries: entries([
          { value: "Enable it.", node: "p1", via: BEST_PRACTICES },
          { value: "Enable it.", node: "p7", via: DASHBOARD },
        ]),
      }),
    );

    expect(tree.byNodeId.get("p1")?.markers[0]?.duplicateOfPosition).toBeUndefined();
    expect(tree.byNodeId.get("p7")?.markers[0]).toMatchObject({
      position: 2,
      duplicateOfPosition: 1,
    });
  });

  test("carries the engine's enclosing-node fallback onto the line and the marker", () => {
    const tree = built(
      provenance({
        entries: entries([{ value: "Something in here.", node: "p2", approximate: true }]),
        degraded: true,
      }),
    );

    expect(tree.byNodeId.get("p2")?.lines[0]?.note).toBe(APPROXIMATE_NOTE);
    expect(tree.byNodeId.get("p2")?.markers[0]?.approximate).toBe(true);
  });

  test("ignores strings that no preset-tree node wrote", () => {
    // A `defaults`/`global`/`inherited` layer has no node to hang a row on.
    expect(
      buildTreeDescriptions(provenance({ entries: entries([{ value: "From nowhere." }]) })),
    ).toBeNull();
  });

  test("files nothing at all under the repo config, which renders no row", () => {
    // `flattenTree` starts at the root's CHILDREN, so a fact filed under the
    // root would never mount — and counting it would promise a line the tree
    // cannot show.
    const tree = built(
      provenance({
        entries: entries([
          { value: "Our house rules.", node: "root", nodeName: "(input config)" },
          { value: "Pin Docker digests.", node: "p9" },
        ]),
      }),
    );

    expect(tree.contributorCount).toBe(1);
    expect(tree.byNodeId.has("root")).toBe(false);
    // The slot numbering still counts the root's sentence: the marker names a
    // position in the final array, which is where that sentence really is.
    expect(tree.byNodeId.get("p9")?.markers[0]).toMatchObject({ position: 2, total: 2 });
  });

  test("returns null when only the repo config wrote descriptions", () => {
    // Otherwise the title advertises descriptions no name in the tree shows.
    expect(
      buildTreeDescriptions(
        provenance({
          entries: entries([
            { value: "Our house rules.", node: "root", nodeName: "(input config)" },
            { value: "And another.", node: "root", nodeName: "(input config)" },
          ]),
        }),
      ),
    ).toBeNull();
  });

  test("returns null for a run whose description array is empty and lost nothing", () => {
    expect(buildTreeDescriptions(provenance({ entries: [] }))).toBeNull();
  });
});

describe("buildTreeDescriptions — drops", () => {
  const WRAPPER: DroppedDescription = {
    value: "The config that Renovate recommends.",
    node: { nodeId: "p2", name: "config:best-practices" },
    reason: "wrapper-preset",
  };
  const MUTED: DroppedDescription = {
    value: "Group known monorepo packages together.",
    node: { nodeId: "p5", name: "group:monorepos" },
    reason: "description-override",
    droppedBy: { nodeId: "p4", name: "group:recommended" },
  };

  test("shows a dropped sentence plainly at the preset that authored it", () => {
    const tree = built(provenance({ entries: [], dropped: [WRAPPER] }));

    expect(tree.byNodeId.get("p2")?.lines).toEqual([
      {
        key: "x0",
        kind: "dropped",
        text: "The config that Renovate recommends.",
        // No drop-reason note: shedding a wrapper's description is Renovate
        // working as designed, and on the node's own card the sentence is the
        // point — the mechanics stay on the blame ledger's footer.
        note: undefined,
      },
    ]);
    // A drop is not a contribution — the title's count must not claim it.
    expect(tree.contributorCount).toBe(0);
  });

  test("an approximate drop keeps the attribution hedge, and only that", () => {
    // The drop came out of a subtree the engine had already degraded to its
    // enclosing node (069 PR 1), so the node it sits on is a guess — the one
    // annotation a dropped line still carries.
    const tree = built(
      provenance({ entries: [], dropped: [{ ...WRAPPER, approximate: true }], degraded: true }),
    );

    expect(tree.byNodeId.get("p2")?.lines[0]?.note).toBe(APPROXIMATE_NOTE);
  });

  test("puts the mute note on the node that pressed the button, not the author", () => {
    const tree = built(
      provenance({
        entries: entries([{ value: "Use the recommended groups.", node: "p4" }]),
        dropped: [MUTED, { ...MUTED, node: { nodeId: "p6", name: "group:jest" } }],
      }),
    );

    // The muting node keeps its own contribution AND gains the note.
    expect(tree.byNodeId.get("p4")?.lines.map((line) => line.kind)).toEqual([
      "contribution",
      "mute",
    ]);
    expect(tree.byNodeId.get("p4")?.lines[1]?.note).toBe(muteNoteText(2));
    expect(tree.byNodeId.get("p5")?.lines[0]?.kind).toBe("dropped");
  });

  test("lets one node be both the author and the muter of the same sentence", () => {
    // An `overrideDescription` replaces the resolved description of the whole
    // subtree INCLUDING the overriding node's own sentence, so the node that
    // pressed the button can be the author of one of the drops.
    const own: DroppedDescription = {
      value: "Group known monorepo packages together.",
      node: { nodeId: "p4", name: "group:recommended" },
      reason: "description-override",
      droppedBy: { nodeId: "p4", name: "group:recommended" },
    };
    const tree = built(provenance({ entries: [], dropped: [own] }));

    expect(tree.byNodeId.get("p4")?.lines.map((line) => line.kind)).toEqual(["dropped", "mute"]);
    expect(tree.byNodeId.get("p4")?.lines[1]?.note).toBe(muteNoteText(1));
  });

  test("does not attach a mute note to the repo config, which renders no row", () => {
    const tree = built(
      provenance({
        entries: [],
        dropped: [{ ...MUTED, droppedBy: { nodeId: "root", name: "(input config)" } }],
      }),
    );

    expect(tree.byNodeId.has("root")).toBe(false);
    // The author's line still exists — plainly, like every dropped sentence.
    expect(tree.byNodeId.get("p5")?.lines[0]).toMatchObject({ kind: "dropped", note: undefined });
  });
});

function marker(parts: Partial<PositionMarker> = {}): PositionMarker {
  return { key: "p0", position: 16, total: 24, ...parts };
}

function countText(contributorCount: number): string {
  return describeCountText({ byNodeId: new Map(), contributorCount, total: 24 });
}

describe("wording", () => {
  test("the position marker names the slot in the final array", () => {
    expect(positionMarkerText(marker())).toBe("→ #16 of 24");
    expect(positionMarkerText(marker({ duplicateOfPosition: 1 }))).toBe("→ #16 of 24 · duplicate");
    expect(positionMarkerText(marker({ approximate: true }))).toBe("→ #16 of 24 · approx");
  });

  test("a duplicate that is also approximate keeps the caveat", () => {
    // Dropping `approx` here would assert a node-to-slot tie the engine only
    // guessed at — the one claim a degraded run must not make.
    expect(positionMarkerText(marker({ duplicateOfPosition: 1, approximate: true }))).toBe(
      "→ #16 of 24 · duplicate · approx",
    );

    const title = positionMarkerTitle(marker({ duplicateOfPosition: 3, approximate: true }));
    expect(title).toContain("a repeat of #3");
    expect(title).toContain(APPROXIMATE_NOTE);
  });

  test("its tooltip states the slot, the repeat and the hedge", () => {
    expect(positionMarkerTitle(marker())).toBe(
      "Sentence #16 of 24 in the final description array.",
    );
    expect(positionMarkerTitle(marker({ duplicateOfPosition: 3 }))).toContain("a repeat of #3");
    expect(positionMarkerTitle(marker({ approximate: true }))).toContain(APPROXIMATE_NOTE);
  });

  test("zipDescLines pairs each contribution with its marker, in order", () => {
    // The pairing is positional (`buildTreeDescriptions` fills both arrays
    // from the same loop) — this pins that a drop between two contributions
    // does not shift the second one's marker.
    const tree = built(
      provenance({
        entries: entries([
          { value: "First.", node: "p1" },
          { value: "Second.", node: "p1" },
        ]),
        dropped: [
          {
            value: "Gone.",
            node: { nodeId: "p1", name: ":dependencyDashboard" },
            reason: "wrapper-preset",
          },
        ],
      }),
    );
    const zipped = zipDescLines(tree.byNodeId.get("p1") ?? { markers: [], lines: [] });

    expect(zipped.map(({ line, marker: m }) => [line.kind, m?.position])).toEqual([
      ["contribution", 1],
      ["contribution", 2],
      ["dropped", undefined],
    ]);
  });

  test("the approximate note is the shared hedge, not a fourth phrasing of it", () => {
    // `description-approx.ts` owns this sentence for every surface; the nameless
    // form is the tree's, because the line is rendered on the node it would name.
    expect(APPROXIMATE_NOTE).toBe(approximateTitle());
  });

  test("the mute note and the title count agree with English", () => {
    expect(muteNoteText(1)).toBe("mutes 1 description below (`overrideDescription`)");
    expect(muteNoteText(135)).toBe("mutes 135 descriptions below (`overrideDescription`)");

    expect(countText(0)).toBe("none contribute descriptions");
    expect(countText(1)).toBe("1 contributes a description");
    expect(countText(18)).toBe("18 contribute descriptions");
  });
});
