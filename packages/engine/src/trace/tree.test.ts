import { describe, expect, it } from "vitest";
import type { PresetNode, PresetNodeState } from "./model";
import { mergingChildren, walkResolutionOrder } from "./tree";

function node(
  name: string,
  children: PresetNode[] = [],
  overrides: Partial<PresetNode> = {},
): PresetNode {
  return {
    id: name,
    name,
    state: "resolved" as PresetNodeState,
    resolved: {},
    input: {},
    children,
    ...overrides,
  } as PresetNode;
}

describe("mergingChildren", () => {
  it("keeps only non-nested, resolved children carrying a payload", () => {
    const root = node("root", [
      node("plain"),
      node("nested", [], { nested: true }),
      node("errored", [], { state: "error" as PresetNodeState, resolved: undefined }),
      node("no-payload", [], { resolved: undefined }),
    ]);
    expect(mergingChildren(root).map((child) => child.name)).toEqual(["plain"]);
  });
});

describe("walkResolutionOrder", () => {
  /**
   * The property both provenance walks depend on: a node's own body is visited
   * AFTER every merging descendant, so the last visit carrying a key is that
   * key's winner. Children keep `extends` order.
   */
  it("visits each subtree in extends order, the node's own body last", () => {
    const root = node("root", [
      node("a", [node("a1"), node("a2")]),
      node("skipped", [node("never")], { nested: true }),
      node("b"),
    ]);
    const seen: string[] = [];
    walkResolutionOrder(root, (visited) => seen.push(visited.name));
    expect(seen).toEqual(["a1", "a2", "a", "b", "root"]);
  });

  it("visits a leaf exactly once", () => {
    const seen: string[] = [];
    walkResolutionOrder(node("only"), (visited) => seen.push(visited.name));
    expect(seen).toEqual(["only"]);
  });
});
