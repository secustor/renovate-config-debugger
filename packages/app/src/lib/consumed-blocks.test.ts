import type { RuleAttribution, SimulationResult } from "@renovate-config-debugger/engine";
import { describe, expect, test } from "vitest";
import { ruleEval, simResult } from "@tools/test/simulation";
import { appliedUpdateTypeBlock, consumedAuthoredBlocks } from "./consumed-blocks";

/**
 * Roadmap 048. `flattened.merged` alone cannot tell "there was no `major`
 * block" from "the `major` block was there and changed nothing" — both are the
 * empty array, and both read as "nothing happened" in a payload. These pin the
 * three answers `appliedUpdateTypeBlock` gives instead, plus the existing
 * aside's behavior, so the new sibling cannot drift it.
 */
function simFixture(flattened: Partial<SimulationResult["flattened"]> = {}): SimulationResult {
  return simResult({ flattened: { merged: [], blocks: {}, authoredBlocks: [], ...flattened } });
}

/** One matched rule set the `major` block, so the attribution chip is unambiguous. */
function simWithMajorSetter(): SimulationResult {
  return simResult({
    rules: [{ ...ruleEval(0, "matched"), merged: [{ key: "major", after: { automerge: false } }] }],
    flattened: {
      merged: [],
      blocks: { major: { automerge: false } },
      authoredBlocks: ["major"],
    },
  });
}

describe("appliedUpdateTypeBlock", () => {
  test("no updateType, and no block by that name, are both `null`", () => {
    expect(
      appliedUpdateTypeBlock(simFixture({ blocks: { minor: { automerge: true } } })),
    ).toBeNull();
    expect(
      appliedUpdateTypeBlock(
        simFixture({ updateType: "major", blocks: { minor: { automerge: true } } }),
      ),
    ).toBeNull();
  });

  test("a block that existed and contributed nothing is NOT null — it is empty", () => {
    // Renovate's defaults declare all seven blocks, so this is the common case
    // the payload used to report as an indistinguishable empty `merged`.
    const applied = appliedUpdateTypeBlock(
      simFixture({ updateType: "major", blocks: { major: {} }, authoredBlocks: [] }),
    );
    expect(applied).toEqual({ key: "major", keys: [], authored: false, changed: [] });
  });

  test("an authored block that merged up names the keys it set", () => {
    const applied = appliedUpdateTypeBlock(
      simFixture({
        updateType: "minor",
        merged: [{ key: "automerge", after: true }],
        blocks: { minor: { automerge: true } },
        authoredBlocks: ["minor"],
      }),
    );
    expect(applied).toEqual({
      key: "minor",
      keys: ["automerge"],
      authored: true,
      changed: ["automerge"],
    });
  });
});

describe("consumedAuthoredBlocks", () => {
  /** The 047 aside's rule, pinned: only AUTHORED blocks, and never the one that
   *  applied — regression cover for the module's other export. */
  test("names the authored blocks that did not apply, and nothing else", () => {
    const sim = simFixture({
      updateType: "minor",
      merged: [{ key: "automerge", after: true }],
      blocks: { minor: { automerge: true }, major: { automerge: false }, patch: {} },
      authoredBlocks: ["minor", "major"],
    });
    expect(consumedAuthoredBlocks(sim, null)).toEqual([
      { key: "major", keys: ["automerge"], layer: undefined },
    ]);
  });
});

describe("the attribution chip's layer", () => {
  const directExtend = { kind: "preset", nodeId: "n1", name: "config:best-practices" } as const;

  test("credits the ORIGINATING preset body, not the direct extend it arrived through", () => {
    const attribution: RuleAttribution[] = [
      {
        index: 0,
        layer: directExtend,
        sourceIndex: 0,
        writtenBy: { nodeId: "n2", name: "security:minimumReleaseAgeNpm", sourceIndex: 0 },
      },
    ];
    expect(consumedAuthoredBlocks(simWithMajorSetter(), attribution)[0]?.layer).toEqual({
      kind: "preset",
      nodeId: "n2",
      name: "security:minimumReleaseAgeNpm",
    });
  });

  test("falls back to the direct extend when the engine verified no writer", () => {
    const attribution: RuleAttribution[] = [{ index: 0, layer: directExtend, sourceIndex: 0 }];
    expect(consumedAuthoredBlocks(simWithMajorSetter(), attribution)[0]?.layer).toEqual(
      directExtend,
    );
  });
});
