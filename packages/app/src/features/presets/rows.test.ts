import { describe, expect, test } from "vitest";
import type { PresetNode } from "@renovate-config-debugger/engine";
import type { NodeStats } from "@/components/preset-tree-stats";
import type { NodeDescriptionFacts } from "@/lib/tree-descriptions";
import { buildTreeListRows, type Row } from "./rows";

/**
 * Roadmap 069 (PR 4): the interleaving of description quote lines into the
 * windowed row list. The invariant under test is the one the windowing math
 * depends on — one mounted row per node in compact mode, and in describe mode
 * exactly one EXTRA row per description fact and none for the nodes that have
 * no facts, which is what keeps a 1,088-node tree from growing 1,088 rows.
 */

function node(id: string, name = id): PresetNode {
  return { id, name, children: [], state: "resolved" } as unknown as PresetNode;
}

function row(id: string, depth: number): Row {
  return {
    node: node(id),
    depth,
    hasChildren: false,
    expanded: false,
    dimmed: false,
    elidedChain: null,
    stats: {} as NodeStats,
  };
}

function facts(lines: NodeDescriptionFacts["lines"]): NodeDescriptionFacts {
  return { markers: [], lines };
}

const ROWS = [row("p1", 0), row("p2", 1), row("p3", 1)];

describe("buildTreeListRows", () => {
  test("compact mode mounts exactly the rows it did before describe mode existed", () => {
    const list = buildTreeListRows(ROWS, null);

    expect(list).toHaveLength(ROWS.length);
    expect(list.map((item) => item.kind)).toEqual(["node", "node", "node"]);
    expect(list.map((item) => item.key)).toEqual(["p1", "p2", "p3"]);
  });

  test("adds one row per fact, directly under the node that owns it", () => {
    const list = buildTreeListRows(
      ROWS,
      new Map([
        ["p2", facts([{ key: "c0", kind: "contribution", text: "Pin Docker digests." }])],
        [
          "p3",
          facts([
            { key: "c1", kind: "contribution", text: "Group monorepos." },
            { key: "mute", kind: "mute", text: "", note: "mutes 3 descriptions below" },
          ]),
        ],
      ]),
    );

    expect(list.map((item) => `${item.kind}:${item.key}`)).toEqual([
      "node:p1",
      "node:p2",
      "desc:p2:c0",
      "node:p3",
      "desc:p3:c1",
      "desc:p3:mute",
    ]);
  });

  test("a quote row inherits its node's indent, so it hangs under the name", () => {
    const list = buildTreeListRows(
      [row("p2", 3)],
      new Map([["p2", facts([{ key: "c0", kind: "contribution", text: "Pin Docker digests." }])]]),
    );

    const quote = list[1];
    expect(quote?.kind === "desc" ? quote.depth : null).toBe(3);
  });

  test("nodes absent from the index add nothing at all", () => {
    const list = buildTreeListRows(ROWS, new Map());

    expect(list).toHaveLength(ROWS.length);
  });
});
