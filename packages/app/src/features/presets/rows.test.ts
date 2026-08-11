import { describe, expect, test } from "vitest";
import type { PresetNode } from "@renovate-config-debugger/engine";
import { computeTreeStats } from "@/components/preset-tree-stats";
import { flattenTree, type Row } from "./rows";

/**
 * Roadmap 069 (PR 4): described nodes and the flattened row list. The
 * invariant under test is reachability — a node whose name carries the
 * description hover card must actually mount a row, whatever hide-zero would
 * otherwise do with it — while a run without descriptions flattens exactly as
 * it always did.
 */

/** A resolved preset with a body, which is all `computeTreeStats` reads. */
function preset(id: string, name: string, input: unknown, children: PresetNode[] = []): PresetNode {
  return { id, name, state: "resolved", input, children };
}

/**
 * The collision between described nodes and hide-zero. A wrapper preset's body
 * is only `extends` — Renovate deleted its description, which is exactly what
 * its hover card reports — so the "hide zero-contribution routers" toggle
 * would elide the very row that card hangs from.
 */
const LEAF = preset("p2", "docker:pinDigests", { pinDigests: true });
const WRAPPER = preset("p1", "config:best-practices", { extends: ["docker:pinDigests"] }, [LEAF]);
const ROOT = preset("root", "(input config)", { extends: ["config:best-practices"] }, [WRAPPER]);

describe("flattenTree — described nodes under hide zero-contribution", () => {
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

  test("with no described nodes the wrapper is elided exactly as it always was", () => {
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

  test("changes nothing while hide-zero is off", () => {
    expect(flatten(false, new Set(["p1"]))).toEqual(flatten(false, null));
  });
});

describe("flattenTree — a described node behind a caret", () => {
  // hide-zero's caret test counts CONTRIBUTING descendants, and this subtree
  // has none: without the described set the parent is a leaf and the wrapper
  // below it unreachable.
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
