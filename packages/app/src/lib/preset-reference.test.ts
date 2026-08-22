import type { PresetNode } from "@renovate-config-debugger/engine";
import { describe, expect, it } from "vitest";
import { presetReferenceFacts } from "./preset-reference";
import { computeTreeStats, ROOT_NODE_ID } from "./preset-tree-stats";

/**
 * Roadmap 081: the standard preset hover card's content, at the level where it
 * is checkable — the chain it walks and the three numbers it quotes. The card
 * itself is a rendering of exactly this (`PresetName.test.tsx` pins that it
 * reaches the DOM); everything that could be wrong about the FACTS is here.
 */

function node(id: string, name: string, children: PresetNode[] = []): PresetNode {
  return { id, name, state: "resolved", children };
}

/**
 * root
 *  ├ config:recommended
 *  │   ├ :dependencyDashboard
 *  │   └ group:monorepos
 *  │       └ monorepo:react   (error — still a preset the tree has a row for)
 *  └ github>acme/renovate-config
 */
function fixture(): PresetNode {
  const monorepoReact: PresetNode = { ...node("p4", "monorepo:react"), state: "error" };
  const groupMonorepos = node("p3", "group:monorepos", [monorepoReact]);
  const dashboard = node("p2", ":dependencyDashboard");
  const recommended = node("p1", "config:recommended", [dashboard, groupMonorepos]);
  const acme = node("p5", "github>acme/renovate-config");
  return node(ROOT_NODE_ID, "(your config)", [recommended, acme]);
}

describe("presetReferenceFacts", () => {
  it("walks the real ancestry and never repeats the node's own name", () => {
    const facts = presetReferenceFacts(fixture(), "p4");

    expect(facts?.via).toEqual([
      { kind: "repo", label: "repo config", nodeId: ROOT_NODE_ID },
      { kind: "preset", label: "config:recommended", nodeId: "p1" },
      { kind: "preset", label: "group:monorepos", nodeId: "p3" },
    ]);
    // The design's rule: the chain ends at the PARENT, and the card says "this
    // preset" for the token the reader is already pointing at.
    expect(facts?.via.map((step) => step.label)).not.toContain("monorepo:react");
  });

  it("gives a top-level extend a one-chip chain", () => {
    expect(presetReferenceFacts(fixture(), "p5")?.via).toEqual([
      { kind: "repo", label: "repo config", nodeId: ROOT_NODE_ID },
    ]);
  });

  it("counts direct extends, the whole subtree, and its deepest chain", () => {
    const facts = presetReferenceFacts(fixture(), "p1");

    expect(facts?.directExtends).toBe(2);
    // Both children plus the errored grandchild: the card links into the tree,
    // which has a row for every one of them.
    expect(facts?.totalNested).toBe(3);
    expect(facts?.deepestChain).toBe(2);
  });

  it("reports a leaf as extending nothing", () => {
    const facts = presetReferenceFacts(fixture(), "p2");

    expect(facts?.directExtends).toBe(0);
    expect(facts?.totalNested).toBe(0);
    expect(facts?.deepestChain).toBe(0);
  });

  it("has nothing to say about the root or an unknown id", () => {
    expect(presetReferenceFacts(fixture(), ROOT_NODE_ID)).toBeNull();
    expect(presetReferenceFacts(fixture(), "nope")).toBeNull();
  });
});

describe("computeTreeStats subtree fields", () => {
  it("counts every descendant, not only the resolved ones", () => {
    const stats = computeTreeStats(fixture());

    expect(stats.statsById.get("p3")?.descPresets).toBe(1);
    // `descResolved` deliberately drops the errored node; `descPresets` is the
    // number the hover card quotes precisely because it does not.
    expect(stats.statsById.get("p3")?.descResolved).toBe(0);
    expect(stats.statsById.get(ROOT_NODE_ID)?.descPresets).toBe(5);
  });

  it("measures the deepest chain below a node", () => {
    const stats = computeTreeStats(fixture());

    expect(stats.statsById.get(ROOT_NODE_ID)?.subtreeDepth).toBe(3);
    expect(stats.statsById.get("p4")?.subtreeDepth).toBe(0);
  });
});
