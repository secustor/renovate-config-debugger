import { describe, expect, test } from "vitest";
import type { KeyProvenance } from "@renovate-config-debugger/engine";
import { chainStepText, entryView } from "./provenance";

/**
 * Roadmap 071: what a step of the override chain reports for a key Renovate
 * CONCATENATES. Every such step's `before`/`after` is a cumulative snapshot of
 * the whole array, so the chain restated it once per layer — the contribution
 * is the slice, and the totals say where it sits.
 */

function entry(chain: KeyProvenance["chain"], finalValue: unknown): KeyProvenance {
  return { key: "labels", finalValue, isDefaultOnly: false, chain };
}

describe("entryView", () => {
  test("an appending layer reports what it appended, not the whole array", () => {
    const view = entryView(
      entry(
        [
          { layer: { kind: "global" }, action: "set", before: undefined, after: ["a"] },
          { layer: { kind: "repo" }, action: "concat", before: ["a"], after: ["a", "b", "c"] },
        ],
        ["a", "b", "c"],
      ),
    );
    expect(view.chain[1]).toEqual({
      layer: "repo",
      action: "concat",
      addedCount: 2,
      added: ["b", "c"],
      totalCount: 3,
    });
    // The establishing step is not an append and keeps both sides.
    expect(view.chain[0]).toMatchObject({ action: "set", after: ["a"] });
  });

  test("a concat that did NOT append keeps the snapshots — honest over clever", () => {
    // Renovate's nested-`extends` pass can rewrite `after` wholesale, and a
    // "slice" of an array that is not a prefix would be an invented one.
    const view = entryView(
      entry(
        [
          {
            layer: { kind: "repo" },
            action: "concat",
            before: ["a"],
            after: ["x", "y"],
            expandedNested: true,
          },
        ],
        ["x", "y"],
      ),
    );
    expect(view.chain[0]).toEqual({
      layer: "repo",
      action: "concat",
      before: ["a"],
      after: ["x", "y"],
      expandedNested: true,
    });
  });

  test("noop steps stay out of the chain", () => {
    const view = entryView(
      entry(
        [
          { layer: { kind: "defaults" }, action: "set", before: undefined, after: [], noop: true },
          { layer: { kind: "repo" }, action: "concat", before: [], after: ["a"] },
        ],
        ["a"],
      ),
    );
    expect(view.chain).toHaveLength(1);
  });
});

describe("chainStepText", () => {
  test("an append reads as an append, a replacement as the value", () => {
    const view = entryView(
      entry(
        [
          { layer: { kind: "global" }, action: "set", before: undefined, after: ["a"] },
          { layer: { kind: "repo" }, action: "concat", before: ["a"], after: ["a", "b"] },
        ],
        ["a", "b"],
      ),
    );
    expect(view.chain.map((step) => chainStepText(step))).toEqual(['["a"]', '+1 → 2 total ["b"]']);
  });
});
