import type { SimulationResult } from "@renovate-config-debugger/engine";
import { describe, expect, test } from "vitest";
import { changedDependencyKeys } from "./simulation-changes";

/**
 * The roadmap-046 invariant, untested until roadmap 048 hoisted it out of
 * `RuleSimulator`'s `useMemo`: the update-type blocks Renovate ALWAYS deletes
 * are not "removed by the rules" — listing them as such buried the one real
 * change under seven `removed` rows — while a key such a block merged UP is a
 * genuine change, because it lands top-level where the base never had it.
 */
function simFixture(finalDependencyConfig: Record<string, unknown>): SimulationResult {
  return {
    rules: [],
    rawFinalConfig: finalDependencyConfig,
    finalDependencyConfig,
    flattened: { merged: [], blocks: {}, authoredBlocks: [] },
    missingInputs: { rules: 0, groups: [] },
    mergeSteps: [],
    errors: [],
    warnings: [],
    notes: [],
  };
}

describe("changedDependencyKeys", () => {
  test("the flattened blocks are not losses, and a key one merged up is a gain", () => {
    const finalConfig = {
      labels: ["deps"],
      packageRules: [{ matchPackageNames: ["react"] }],
      major: {},
      minor: { automerge: true },
      patch: {},
      pin: {},
      digest: {},
      lockFileMaintenance: {},
      replacement: {},
    };
    // `automerge` was only ever inside the `minor` block; flattening put it on
    // top level. `packageRules` is off the base by construction.
    expect(changedDependencyKeys(simFixture({ labels: ["deps"], automerge: true }), finalConfig)) //
      .toEqual(["automerge"]);
  });

  test("a rule that overwrote a key reports it, deep-equal values do not", () => {
    const finalConfig = { labels: ["deps"], groupName: "old", schedule: ["at any time"] };
    expect(
      changedDependencyKeys(
        simFixture({ labels: ["deps"], groupName: "new", schedule: ["at any time"] }),
        finalConfig,
      ),
    ).toEqual(["groupName"]);
  });

  test("no effective config is no answer, not an invented one", () => {
    expect(changedDependencyKeys(simFixture({ automerge: true }), undefined)).toEqual([]);
  });
});
