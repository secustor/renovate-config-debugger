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
    flattened: { merged: [], blocks: {} },
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
    // sorted by key: automerge (changed), groupName (added in B), labels (removed from A)
    expect(cmp.configDelta).toEqual([
      { key: "automerge", before: false, after: true, inA: true, inB: true },
      { key: "groupName", after: "grp", inA: false, inB: true },
      { key: "labels", before: ["old"], inA: true, inB: false },
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
