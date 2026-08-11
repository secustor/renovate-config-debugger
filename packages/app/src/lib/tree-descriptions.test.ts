import { describe, expect, test } from "vitest";
import type {
  DescriptionAttribution,
  DescriptionProvenance,
  DroppedDescription,
  ProvenanceLayer,
} from "@renovate-config-debugger/engine";
import {
  APPROXIMATE_NOTE,
  buildTreeDescriptions,
  describeCountText,
  droppedNoteText,
  muteNoteText,
  type PositionMarker,
  positionMarkerText,
  positionMarkerTitle,
  type TreeDescriptions,
} from "./tree-descriptions";

/**
 * Roadmap 069 (PR 4): the per-node index describe mode renders from, and the
 * wording of every note, over hand-built provenance. The engine's own tests
 * (PR 1) prove the ATTRIBUTION against the real 1,088-preset tree; what needs
 * proving here is the inversion — that a node's facts land on that node, that
 * a drop shows at the preset that authored it while the mute note shows at the
 * one that pressed the button, and that nodes with nothing to say stay absent
 * from the map, which is describe mode's whole performance story.
 */

const REPO: ProvenanceLayer = { kind: "repo" };

function preset(nodeId: string, name = nodeId): ProvenanceLayer {
  return { kind: "preset", nodeId, name };
}

const DASHBOARD = preset("p1", ":dependencyDashboard");
const BEST_PRACTICES = preset("p2", "config:best-practices");

interface EntrySpec {
  value: string;
  /** The writing node's id; `undefined` = a layer with no preset tree. */
  node?: string;
  nodeName?: string;
  via?: ProvenanceLayer;
  approximate?: boolean;
}

/** Builds `entries` with the indices and duplicate markers the engine assigns. */
function entries(specs: EntrySpec[]): DescriptionAttribution[] {
  const firstByValue = new Map<string, number>();
  return specs.map((spec, index) => {
    const duplicateOfIndex = firstByValue.get(spec.value);
    if (duplicateOfIndex === undefined) {
      firstByValue.set(spec.value, index);
    }
    return {
      index,
      value: spec.value,
      node: spec.node ? { nodeId: spec.node, name: spec.nodeName ?? spec.node } : undefined,
      viaTopLevel: spec.via ?? REPO,
      duplicateOfIndex,
      approximate: spec.approximate,
    };
  });
}

function provenance(
  parts: Partial<DescriptionProvenance> & Pick<DescriptionProvenance, "entries">,
): DescriptionProvenance {
  return {
    dropped: [],
    ruleDescriptions: [],
    degraded: false,
    ...parts,
  };
}

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
        title: "Enable Renovate Dependency Dashboard creation.",
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

  test("excludes the repo config's own sentences from the contributor count", () => {
    // The root never renders a row, so counting it would promise a line the
    // tree cannot show.
    const tree = built(
      provenance({
        entries: entries([
          { value: "Our house rules.", node: "root", nodeName: "(input config)" },
          { value: "Pin Docker digests.", node: "p9" },
        ]),
      }),
    );

    expect(tree.contributorCount).toBe(1);
    expect(tree.byNodeId.has("root")).toBe(true);
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
    reason: "ignore-deps-quirk",
    droppedBy: { nodeId: "p4", name: "group:recommended" },
  };

  test("shows a dropped sentence at the preset that authored it", () => {
    const tree = built(provenance({ entries: [], dropped: [WRAPPER] }));

    expect(tree.byNodeId.get("p2")?.lines).toEqual([
      {
        key: "x0",
        kind: "dropped",
        text: "The config that Renovate recommends.",
        note: droppedNoteText(WRAPPER),
        title: `The config that Renovate recommends. — ${droppedNoteText(WRAPPER).replaceAll("`", "")}`,
      },
    ]);
    // A drop is not a contribution — the title's count must not claim it.
    expect(tree.contributorCount).toBe(0);
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

  test("does not attach a mute note to the repo config, which renders no row", () => {
    const tree = built(
      provenance({
        entries: [],
        dropped: [{ ...MUTED, droppedBy: { nodeId: "root", name: "(input config)" } }],
      }),
    );

    expect(tree.byNodeId.has("root")).toBe(false);
    expect(tree.byNodeId.get("p5")?.lines[0]?.note).toBe(
      "muted by `(input config)` — its empty `ignoreDeps` deletes every description it extends",
    );
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

  test("its tooltip offers the ledger jump only when there is one", () => {
    expect(positionMarkerTitle(marker(), false)).toBe(
      "Sentence #16 of 24 in the final description array.",
    );
    expect(positionMarkerTitle(marker(), true)).toContain(
      "Show the full array in the Effective config.",
    );
    expect(positionMarkerTitle(marker({ duplicateOfPosition: 3 }), false)).toContain(
      "a repeat of #3",
    );
    expect(positionMarkerTitle(marker({ approximate: true }), false)).toContain(APPROXIMATE_NOTE);
  });

  test("each drop rule explains itself in the tree's own terms", () => {
    expect(
      droppedNoteText({
        value: "x",
        node: { nodeId: "p1", name: "config:recommended" },
        reason: "wrapper-preset",
      }),
    ).toBe("Renovate drops it on merge — wrapper preset (body is only `description` + `extends`)");
    expect(
      droppedNoteText({
        value: "x",
        node: { nodeId: "p1", name: "packages:eslint" },
        reason: "package-list-preset",
      }),
    ).toBe("Renovate drops it on merge — package-name list (body only sets `matchPackageNames`)");
    expect(
      droppedNoteText({
        value: "x",
        node: { nodeId: "p1", name: "group:jest" },
        reason: "ignore-deps-quirk",
      }),
    ).toBe(
      "muted by the extending config — its empty `ignoreDeps` deletes every description it extends",
    );
  });

  test("the mute note and the title count agree with English", () => {
    expect(muteNoteText(1)).toBe("mutes 1 description below (empty `ignoreDeps`)");
    expect(muteNoteText(135)).toBe("mutes 135 descriptions below (empty `ignoreDeps`)");

    expect(countText(0)).toBe("none contribute descriptions");
    expect(countText(1)).toBe("1 contributes a description");
    expect(countText(18)).toBe("18 contribute descriptions");
  });
});
