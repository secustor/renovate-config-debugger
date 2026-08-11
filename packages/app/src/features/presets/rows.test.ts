import { describe, expect, test } from "vitest";
import type { PresetNode } from "@renovate-config-debugger/engine";
import { computeTreeStats, type NodeStats } from "@/components/preset-tree-stats";
import type { DescLine, DescLineKind, NodeDescriptionFacts } from "@/lib/tree-descriptions";
import { buildTreeListRows, flattenTree, type Row } from "./rows";

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

function line(key: string, kind: DescLineKind, text: string, note?: string): DescLine {
  return { key, kind, text, note, title: text };
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
        ["p2", facts([line("c0", "contribution", "Pin Docker digests.")])],
        [
          "p3",
          facts([
            line("c1", "contribution", "Group monorepos."),
            line("mute", "mute", "", "mutes 3 descriptions below"),
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
      new Map([["p2", facts([line("c0", "contribution", "Pin Docker digests.")])]]),
    );

    const quote = list[1];
    expect(quote?.kind === "desc" ? quote.depth : null).toBe(3);
  });

  test("nodes absent from the index add nothing at all", () => {
    const list = buildTreeListRows(ROWS, new Map());

    expect(list).toHaveLength(ROWS.length);
  });
});

/** A resolved preset with a body, which is all `computeTreeStats` reads. */
function preset(id: string, name: string, input: unknown, children: PresetNode[] = []): PresetNode {
  return { id, name, state: "resolved", input, children };
}

/**
 * Roadmap 069 (PR 4): the collision between describe mode and hide-zero. A
 * wrapper preset's body is only `extends` — Renovate deleted its description,
 * which is exactly what describe mode reports — so the "hide zero-contribution
 * routers" toggle would elide the very row the drop line belongs to.
 */
const LEAF = preset("p2", "docker:pinDigests", { pinDigests: true });
const WRAPPER = preset("p1", "config:best-practices", { extends: ["docker:pinDigests"] }, [LEAF]);
const ROOT = preset("root", "(input config)", { extends: ["config:best-practices"] }, [WRAPPER]);

describe("flattenTree — describe mode under hide zero-contribution", () => {
  const stats = computeTreeStats(ROOT);
  const flatten = (hideZero: boolean, described: ReadonlySet<string> | null): Row[] =>
    flattenTree({
      root: ROOT,
      stats,
      expandedIdentities: new Set(),
      hideZero,
      query: "",
      described,
    });

  test("compact mode elides the wrapper exactly as it always did", () => {
    const rows = flatten(true, null);

    expect(rows.map((r) => r.node.id)).toEqual(["p2"]);
    expect(rows[0]?.elidedChain?.map((n) => n.name)).toEqual(["config:best-practices"]);
  });

  test("a described wrapper keeps its row, its subtree still shortcut through it", () => {
    const rows = flatten(true, new Set(["p1"]));

    expect(rows.map((r) => r.node.id)).toEqual(["p1", "p2"]);
    // No caret: hide-zero shows the subtree through it unconditionally, so
    // there is nothing to collapse — and the contributor still appears.
    expect(rows[0]).toMatchObject({ depth: 0, hasChildren: false, elidedChain: null });
    expect(rows[1]?.depth).toBe(1);
  });

  test("and its drop line therefore mounts, which is the whole point", () => {
    const list = buildTreeListRows(
      flatten(true, new Set(["p1"])),
      new Map([
        [
          "p1",
          facts([line("x0", "dropped", "The config that Renovate recommends.", "wrapper preset")]),
        ],
      ]),
    );

    expect(list.map((item) => `${item.kind}:${item.key}`)).toEqual([
      "node:p1",
      "desc:p1:x0",
      "node:p2",
    ]);
  });

  test("changes nothing while hide-zero is off", () => {
    expect(flatten(false, new Set(["p1"]))).toEqual(flatten(false, null));
  });
});

describe("flattenTree — a described node behind a caret", () => {
  // hide-zero's caret test counts CONTRIBUTING descendants, and this subtree
  // has none: without describe mode the parent is a leaf and the wrapper below
  // it unreachable.
  const buried = preset("q3", "group:empty", { extends: [] });
  const wrapper = preset("q2", "config:recommended", { extends: ["group:empty"] }, [buried]);
  const contributor = preset("q1", "custom:base", { rangeStrategy: "bump" }, [wrapper]);
  const root = preset("root", "(input config)", { extends: ["custom:base"] }, [contributor]);
  const stats = computeTreeStats(root);
  const flatten = (described: ReadonlySet<string> | null, expandedIdentities: Set<string>): Row[] =>
    flattenTree({ root, stats, expandedIdentities, hideZero: true, query: "", described });

  test("gets a caret on the parent that leads to it", () => {
    expect(flatten(null, new Set())[0]?.hasChildren).toBe(false);
    expect(flatten(new Set(["q2"]), new Set())[0]?.hasChildren).toBe(true);
  });

  test("and shows up once that caret is opened", () => {
    const rows = flatten(new Set(["q2"]), new Set([">custom:base"]));

    expect(rows.map((r) => r.node.id)).toEqual(["q1", "q2"]);
  });
});
