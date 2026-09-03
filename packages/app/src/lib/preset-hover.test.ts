import { describe, expect, test } from "vitest";
import type { PresetNode } from "@renovate-config-debugger/engine";
import { buildPresetLookup } from "./preset-hover";

/**
 * The lookup now reads `computeTreeStats`'s pre-order occurrence lists instead
 * of walking the tree itself, so what needs proving is that the two agree:
 * first occurrence wins for a duplicated name, and the counts still come from
 * that node's `resolved`.
 */

function node(name: string, extra: Partial<PresetNode> = {}): PresetNode {
  return { id: name, name, state: "resolved", children: [], ...extra };
}

describe("buildPresetLookup", () => {
  test("returns an empty map without a tree", () => {
    expect(buildPresetLookup(undefined).size).toBe(0);
  });

  test("first pre-order occurrence of a name wins", () => {
    const root = node("root", {
      id: "root",
      children: [
        node("a", {
          id: "a1",
          children: [node(":dupe", { id: "dupe-first", resolved: { rangeStrategy: "bump" } })],
        }),
        node(":dupe", { id: "dupe-second", duplicate: true, resolved: { automerge: true } }),
      ],
    });
    const info = buildPresetLookup(root).get(":dupe");
    expect(info?.nodeId).toBe("dupe-first");
    expect(info?.optionCount).toBe(1);
  });

  test("counts options and packageRules from the node's resolved body", () => {
    const root = node("root", {
      id: "root",
      children: [
        node("config:recommended", {
          id: "p1",
          source: { presetSource: "internal" },
          resolved: {
            automerge: true,
            rangeStrategy: "bump",
            packageRules: [{ matchPackageNames: ["react"] }, { matchPackageNames: ["vue"] }],
          },
        }),
        node("github>owner/repo", { id: "p2", source: { presetSource: "github" } }),
      ],
    });
    const map = buildPresetLookup(root);
    expect(map.get("config:recommended")).toMatchObject({
      nodeId: "p1",
      sourceKind: "internal",
      optionCount: 2,
      ruleCount: 2,
      state: "resolved",
    });
    // No `resolved` body at all — the card says zero rather than guessing.
    expect(map.get("github>owner/repo")).toMatchObject({
      sourceKind: "github",
      optionCount: 0,
      ruleCount: 0,
    });
  });
});
