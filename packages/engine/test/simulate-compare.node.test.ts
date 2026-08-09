/**
 * Roadmap 018 — unit tests for the pure A/B `compareSimulations` diff. Builds
 * `SimulationResult`-shaped fixtures by hand (the module only reads `rules` and
 * `finalDependencyConfig`), so this needs no Renovate machinery and runs as a
 * plain node test.
 */
import { describe, expect, it } from "vitest";
import { compareSimulations, type RuleEvaluation, type SimulationResult } from "../src/index";

/** A matched rule with the given selector clauses (only key+value are read). */
function matched(index: number, clauses: [string, unknown][]): RuleEvaluation {
  return {
    index,
    verdict: "matched",
    clauses: clauses.map(([key, value]) => ({
      key,
      value,
      state: "matched" as const,
      inputValues: {},
      readFields: [],
    })),
    notes: [],
  };
}

function noMatch(index: number, clauses: [string, unknown][]): RuleEvaluation {
  return { ...matched(index, clauses), verdict: "no-match" };
}

function sim(
  rules: RuleEvaluation[],
  finalDependencyConfig: Record<string, unknown>,
): SimulationResult {
  return {
    rules,
    rawFinalConfig: {},
    finalDependencyConfig,
    flattened: { merged: [], blocks: {}, authoredBlocks: [] },
    // Roadmap 044: the merge step-through's snapshots — the A/B comparison
    // (021) does not read them, so a hand-built fixture leaves them empty.
    mergeSteps: [],
    errors: [],
    warnings: [],
    notes: [],
  };
}

describe("compareSimulations", () => {
  it("reports no behavioral change when matched rules and final config are equal", () => {
    const a = sim([matched(0, [["matchPackageNames", ["react"]]])], { automerge: true });
    // B: same selectors at a DIFFERENT index, same final config — still equal.
    const b = sim(
      [noMatch(0, [["matchDepTypes", ["dev"]]]), matched(1, [["matchPackageNames", ["react"]]])],
      { automerge: true },
    );
    const cmp = compareSimulations(a, b);
    expect(cmp.noChange).toBe(true);
    expect(cmp.matchedOnlyInA).toEqual([]);
    expect(cmp.matchedOnlyInB).toEqual([]);
    expect(cmp.configDelta).toEqual([]);
    expect(cmp.matchedInBoth.map((r) => r.signature)).toEqual([
      JSON.stringify([["matchPackageNames", ["react"]]]),
    ]);
  });

  it("splits matched rules into only-A, only-B, and both by selector signature", () => {
    const shared: [string, unknown][] = [["matchDatasources", ["npm"]]];
    const a = sim([matched(0, shared), matched(1, [["matchPackageNames", ["lodash"]]])], {
      labels: ["a"],
    });
    const b = sim([matched(0, shared), matched(1, [["matchSourceUrls", ["https://x"]]])], {
      labels: ["a"],
    });
    const cmp = compareSimulations(a, b);
    expect(cmp.matchedInBoth.map((r) => r.label)).toEqual(["matchDatasources"]);
    expect(cmp.matchedOnlyInA.map((r) => r.label)).toEqual(["matchPackageNames"]);
    expect(cmp.matchedOnlyInB.map((r) => r.label)).toEqual(["matchSourceUrls"]);
    expect(cmp.noChange).toBe(false);
  });

  it("emits key-level config deltas with before/after and presence flags", () => {
    const a = sim([matched(0, [["matchPackageNames", ["x"]]])], {
      automerge: false,
      labels: ["old"],
    });
    const b = sim([matched(0, [["matchPackageNames", ["x"]]])], {
      automerge: true,
      groupName: "grp",
    });
    const cmp = compareSimulations(a, b);
    expect(cmp.noChange).toBe(false);
    // sorted by key: automerge (changed), groupName (added in B), labels
    // (removed from A). These fixtures have no merge steps, so every present
    // value is honestly flagged as inherited (replay-02 N8).
    expect(cmp.configDelta).toEqual([
      {
        key: "automerge",
        before: false,
        after: true,
        inA: true,
        inB: true,
        beforeInherited: true,
        afterInherited: true,
      },
      { key: "groupName", after: "grp", inA: false, inB: true, afterInherited: true },
      { key: "labels", before: ["old"], inA: true, inB: false, beforeInherited: true },
    ]);
  });

  it("distinguishes an inherited default from a value a merge step wrote (replay-02 N8)", () => {
    // A: automerge=false reached the final config with NO step writing it —
    // Renovate's default surviving a major run. B: a step (the flatten step of
    // a minor run) wrote automerge=true. The delta must not present A's
    // default as an explicit value: that asserts an `automerge: false` the
    // config never contains.
    const a = sim([matched(0, [["matchPackageNames", ["x"]]])], { automerge: false });
    const b = {
      ...sim([matched(0, [["matchPackageNames", ["x"]]])], { automerge: true }),
      mergeSteps: [
        {
          kind: "flatten" as const,
          updateType: "minor",
          before: { automerge: false },
          after: { automerge: true },
          merged: [{ key: "automerge", before: false, after: true }],
        },
      ],
    };
    const cmp = compareSimulations(a, b);
    expect(cmp.configDelta).toEqual([
      { key: "automerge", before: false, after: true, inA: true, inB: true, beforeInherited: true },
    ]);
  });

  it("ignores non-matched rules on both sides", () => {
    const a = sim(
      [matched(0, [["matchManagers", ["npm"]]]), noMatch(1, [["matchPackageNames", ["gone"]]])],
      {},
    );
    const b = sim(
      [noMatch(0, [["matchManagers", ["npm"]]]), matched(1, [["matchManagers", ["npm"]]])],
      {},
    );
    const cmp = compareSimulations(a, b);
    // matchManagers matched in both (A idx0, B idx1); the no-match rules drop out.
    expect(cmp.matchedInBoth.map((r) => r.label)).toEqual(["matchManagers"]);
    expect(cmp.matchedOnlyInA).toEqual([]);
    expect(cmp.matchedOnlyInB).toEqual([]);
    expect(cmp.noChange).toBe(true);
  });

  /**
   * Roadmap 062: the two axes. `merged` is what a rule DID; two matched rules
   * that merged the same keys to the same values are the same rule wearing a
   * different pattern, and that is identity churn — the unavoidable side effect
   * of editing the array the rule matches on — not a behavior change.
   */
  describe("behavior versus rule identity", () => {
    const effect = [{ key: "groupName", after: "frontend" }];
    const wide = matched(0, [["matchPackageNames", ["react", "vue"]]]);
    const narrow = matched(0, [["matchPackageNames", ["react"]]]);

    it("a rewritten selector with the same effect is identity churn, not behavior", () => {
      const a = sim([{ ...wide, merged: effect }], { groupName: "frontend" });
      const b = sim([{ ...narrow, merged: effect }], { groupName: "frontend" });
      const cmp = compareSimulations(a, b);
      expect(cmp.noChange).toBe(true);
      expect(cmp.rulesChanged).toBe(true);
      expect(cmp.behaviorOnlyInA).toEqual([]);
      expect(cmp.behaviorOnlyInB).toEqual([]);
      expect(cmp.signatureChanges).toHaveLength(1);
      // The signature-level fields are unchanged — the identity claim is still
      // exactly as reported before, it just no longer speaks for behavior.
      expect(cmp.matchedOnlyInA).toHaveLength(1);
      expect(cmp.matchedOnlyInB).toHaveLength(1);
    });

    it("a rewritten selector that changed what the rule did IS a behavior change", () => {
      const a = sim([{ ...wide, merged: effect }], { groupName: "frontend" });
      const b = sim([{ ...narrow, merged: [{ key: "groupName", after: "ui" }] }], {
        groupName: "ui",
      });
      const cmp = compareSimulations(a, b);
      expect(cmp.noChange).toBe(false);
      expect(cmp.signatureChanges).toEqual([]);
      expect(cmp.behaviorOnlyInA).toHaveLength(1);
      expect(cmp.behaviorOnlyInB).toHaveLength(1);
    });

    it("an unrecorded effect never pairs — two unknowns are not the same rule", () => {
      // `merged` absent on both sides (a fixture, or a rule from before 044).
      const a = sim([matched(0, [["matchPackageNames", ["lodash"]]])], {});
      const b = sim([matched(0, [["matchSourceUrls", ["https://x"]]])], {});
      const cmp = compareSimulations(a, b);
      expect(cmp.signatureChanges).toEqual([]);
      expect(cmp.behaviorOnlyInA).toHaveLength(1);
      expect(cmp.behaviorOnlyInB).toHaveLength(1);
      expect(cmp.noChange).toBe(false);
    });

    it("identical rules on both sides change neither axis", () => {
      const a = sim([{ ...wide, merged: effect }], { groupName: "frontend" });
      const cmp = compareSimulations(a, a);
      expect(cmp.noChange).toBe(true);
      expect(cmp.rulesChanged).toBe(false);
      expect(cmp.signatureChanges).toEqual([]);
    });
  });

  /**
   * Roadmap 068 (2026-07 persona study, 4 of 9 sessions): every consumer was
   * re-deriving "so did it change?" from six arrays and two booleans. The net
   * effect is stated here, once, in the order a reader asks it: the changed
   * keys when there are any, the rules that started or stopped otherwise, and
   * the identity churn only ever as a parenthetical.
   */
  describe("summary", () => {
    const effect = [{ key: "groupName", after: "frontend" }];
    const wide = matched(0, [["matchPackageNames", ["react", "vue"]]]);
    const narrow = matched(0, [["matchPackageNames", ["react"]]]);

    it("names the changed keys when the effective config moved", () => {
      const a = sim([matched(0, [["matchManagers", ["npm"]]])], { groupName: "old" });
      const b = sim([matched(0, [["matchManagers", ["npm"]]])], { groupName: "new", labels: [] });
      expect(compareSimulations(a, b).summary).toBe("differs: groupName, labels");
    });

    it("counts the rules when the config came out the same", () => {
      const a = sim([matched(0, [["matchPackageNames", ["lodash"]]])], {});
      const b = sim([matched(0, [["matchSourceUrls", ["https://x"]]])], {});
      expect(compareSimulations(a, b).summary).toBe(
        "differs: 1 rule started matching and 1 rule stopped matching, " +
          "with no change to the effective config",
      );
    });

    it("says identical for a behavior-preserving pattern edit, and why", () => {
      const a = sim([{ ...wide, merged: effect }], { groupName: "frontend" });
      const b = sim([{ ...narrow, merged: effect }], { groupName: "frontend" });
      expect(compareSimulations(a, b).summary).toBe(
        "identical: the same effective config results (a rule's pattern text changed)",
      );
    });

    it("says identical without the caveat when nothing moved at all", () => {
      const a = sim([{ ...wide, merged: effect }], { groupName: "frontend" });
      expect(compareSimulations(a, a).summary).toBe(
        "identical: the same rules matched and the same effective config results",
      );
    });

    it("stops naming keys once the list would stop being a line", () => {
      const many = Object.fromEntries(
        Array.from({ length: 9 }, (_, i) => [`key${i}`, i]),
      ) as Record<string, unknown>;
      const cmp = compareSimulations(sim([], {}), sim([], many));
      expect(cmp.summary).toBe("differs: key0, key1, key2, key3, key4, key5 and 3 more");
    });
  });

  it("pairs duplicate-signature matched rules as a multiset", () => {
    const clause: [string, unknown][] = [["matchDatasources", ["npm"]]];
    const a = sim([matched(0, clause), matched(1, clause)], {});
    const b = sim([matched(0, clause)], {});
    const cmp = compareSimulations(a, b);
    expect(cmp.matchedInBoth).toHaveLength(1);
    expect(cmp.matchedOnlyInA).toHaveLength(1);
    expect(cmp.matchedOnlyInB).toHaveLength(0);
  });
});
