/**
 * Roadmap 018 — unit tests for the pure A/B `compareSimulations` diff. Builds
 * `SimulationResult`-shaped fixtures by hand (the module only reads `rules`,
 * `mergeSteps` and `finalDependencyConfig`), so this needs no Renovate
 * machinery and runs as a plain node test.
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
    missingInputs: { rules: 0, groups: [] },
    evaluationErrors: { rules: 0, selectors: [], messages: [], sampleRuleIndexes: [] },
    rawFinalConfig: {},
    finalDependencyConfig,
    flattened: { merged: [], blocks: {}, authoredBlocks: [] },
    // Roadmap 044: the merge step-through's snapshots — a fixture that leaves
    // them empty is honestly saying NO step wrote any of its final config, so
    // every value in it reads as an inherited default (replay-02 N8).
    mergeSteps: [],
    errors: [],
    warnings: [],
    notes: [],
  };
}

/** The same, but with a flatten step that wrote every key of the final config
 *  — so the delta is about values the config SET, not defaults it inherited. */
function simWritten(
  rules: RuleEvaluation[],
  finalDependencyConfig: Record<string, unknown>,
): SimulationResult {
  return {
    ...sim(rules, finalDependencyConfig),
    mergeSteps: [
      {
        kind: "flatten",
        updateType: "minor",
        before: {},
        after: finalDependencyConfig,
        merged: Object.entries(finalDependencyConfig).map(([key, after]) => ({ key, after })),
      },
    ],
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
    expect(cmp.verdict).toBe("identical");
    expect(cmp.identity.onlyInA).toEqual([]);
    expect(cmp.identity.onlyInB).toEqual([]);
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
    expect(cmp.identity.onlyInA.map((r) => r.label)).toEqual(["matchPackageNames"]);
    expect(cmp.identity.onlyInB.map((r) => r.label)).toEqual(["matchSourceUrls"]);
    expect(cmp.verdict).toBe("differs");
  });

  it("emits key-level config deltas with a/b values and presence flags", () => {
    const a = sim([matched(0, [["matchPackageNames", ["x"]]])], {
      automerge: false,
      labels: ["old"],
    });
    const b = sim([matched(0, [["matchPackageNames", ["x"]]])], {
      automerge: true,
      groupName: "grp",
    });
    const cmp = compareSimulations(a, b);
    expect(cmp.verdict).toBe("differs");
    // sorted by key: automerge (changed), groupName (added in B), labels
    // (removed from A). These fixtures have no merge steps, so every present
    // value is honestly flagged as inherited (replay-02 N8).
    expect(cmp.configDelta).toEqual([
      {
        key: "automerge",
        kind: "behavioral",
        a: false,
        b: true,
        inA: true,
        inB: true,
        aInherited: true,
        bInherited: true,
      },
      { key: "groupName", kind: "behavioral", b: "grp", inA: false, inB: true, bInherited: true },
      { key: "labels", kind: "behavioral", a: ["old"], inA: true, inB: false, aInherited: true },
    ]);
  });

  it("distinguishes an inherited default from a value a merge step wrote (replay-02 N8)", () => {
    // A: automerge=false reached the final config with NO step writing it —
    // Renovate's default surviving a major run. B: a step (the flatten step of
    // a minor run) wrote automerge=true. The delta must not present A's
    // default as an explicit value: that asserts an `automerge: false` the
    // config never contains.
    const a = sim([matched(0, [["matchPackageNames", ["x"]]])], { automerge: false });
    const b = simWritten([matched(0, [["matchPackageNames", ["x"]]])], { automerge: true });
    const cmp = compareSimulations(a, b);
    expect(cmp.configDelta).toEqual([
      {
        key: "automerge",
        kind: "behavioral",
        a: false,
        b: true,
        inA: true,
        inB: true,
        aInherited: true,
      },
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
    expect(cmp.identity.onlyInA).toEqual([]);
    expect(cmp.identity.onlyInB).toEqual([]);
    expect(cmp.verdict).toBe("identical");
  });

  /**
   * The two axes. `merged` is what a rule DID; two matched rules that merged
   * the same keys to the same values are the same rule wearing a different
   * pattern, and that is identity churn — the unavoidable side effect of
   * editing the array the rule matches on — not a behavior change.
   */
  describe("behavior versus rule identity", () => {
    const effect = [{ key: "groupName", after: "frontend" }];
    const wide = matched(0, [["matchPackageNames", ["react", "vue"]]]);
    const narrow = matched(0, [["matchPackageNames", ["react"]]]);

    it("a rewritten selector with the same effect is identity churn, not behavior", () => {
      const a = sim([{ ...wide, merged: effect }], { groupName: "frontend" });
      const b = sim([{ ...narrow, merged: effect }], { groupName: "frontend" });
      const cmp = compareSimulations(a, b);
      expect(cmp.verdict).toBe("identical");
      expect(cmp.identity.changed).toBe(true);
      expect(cmp.stoppedMatching).toEqual([]);
      expect(cmp.startedMatching).toEqual([]);
      expect(cmp.identity.signatureChanges).toHaveLength(1);
      // The signature-level fields are unchanged — the identity claim is still
      // exactly as reported before, it just no longer speaks for behavior, and
      // nesting it under `identity` is what says so structurally: an
      // `identity.onlyInA` cannot be misread as "stopped matching".
      expect(cmp.identity.onlyInA).toHaveLength(1);
      expect(cmp.identity.onlyInB).toHaveLength(1);
    });

    it("a rewritten selector that changed what the rule did IS a behavior change", () => {
      const a = sim([{ ...wide, merged: effect }], { groupName: "frontend" });
      const b = sim([{ ...narrow, merged: [{ key: "groupName", after: "ui" }] }], {
        groupName: "ui",
      });
      const cmp = compareSimulations(a, b);
      expect(cmp.verdict).toBe("differs");
      expect(cmp.identity.signatureChanges).toEqual([]);
      expect(cmp.stoppedMatching).toHaveLength(1);
      expect(cmp.startedMatching).toHaveLength(1);
    });

    it("an unrecorded effect never pairs — two unknowns are not the same rule", () => {
      // `merged` absent on both sides (a fixture, or a rule from before 044).
      const a = sim([matched(0, [["matchPackageNames", ["lodash"]]])], {});
      const b = sim([matched(0, [["matchSourceUrls", ["https://x"]]])], {});
      const cmp = compareSimulations(a, b);
      expect(cmp.identity.signatureChanges).toEqual([]);
      expect(cmp.stoppedMatching).toHaveLength(1);
      expect(cmp.startedMatching).toHaveLength(1);
      expect(cmp.verdict).toBe("differs");
    });

    it("identical rules on both sides change neither axis", () => {
      const a = sim([{ ...wide, merged: effect }], { groupName: "frontend" });
      const cmp = compareSimulations(a, a);
      expect(cmp.verdict).toBe("identical");
      expect(cmp.identity.changed).toBe(false);
      expect(cmp.identity.signatureChanges).toEqual([]);
    });
  });

  /**
   * The churn parenthetical used to be one hardcoded sentence — "a rule's
   * pattern text changed" — fired for every behavior-preserving edit, so it
   * was wrong for the ones that ADDED or DROPPED a clause and impossible for
   * two dependencies read through one unchanged file. `kind` and `keys` are
   * computed where both rules are in hand, and the sentence follows from them.
   */
  describe("selector change kinds", () => {
    const effect = [{ key: "groupName", after: "frontend" }];
    const bare = matched(0, [["matchPackageNames", ["react"]]]);
    const withUpdateTypes = matched(0, [
      ["matchPackageNames", ["react"]],
      ["matchUpdateTypes", ["minor", "major"]],
    ]);

    it("names the clause a rule gained", () => {
      const a = sim([{ ...bare, merged: effect }], { groupName: "frontend" });
      const b = sim([{ ...withUpdateTypes, merged: effect }], { groupName: "frontend" });
      const cmp = compareSimulations(a, b, { mode: "config" });
      expect(cmp.verdict).toBe("identical");
      expect(cmp.identity.signatureChanges[0]?.kind).toBe("clause-added");
      expect(cmp.identity.signatureChanges[0]?.keys).toEqual(["matchUpdateTypes"]);
      expect(cmp.summary).toBe(
        "identical: the same effective config results (a rule gained a matchUpdateTypes clause)",
      );
    });

    it("names the clause a rule dropped", () => {
      const a = sim([{ ...withUpdateTypes, merged: effect }], { groupName: "frontend" });
      const b = sim([{ ...bare, merged: effect }], { groupName: "frontend" });
      const cmp = compareSimulations(a, b, { mode: "config" });
      expect(cmp.identity.signatureChanges[0]?.kind).toBe("clause-removed");
      expect(cmp.identity.signatureChanges[0]?.keys).toEqual(["matchUpdateTypes"]);
      expect(cmp.summary).toBe(
        "identical: the same effective config results (a rule dropped its matchUpdateTypes clause)",
      );
    });

    it("calls a swapped clause set a rewrite, and lists every key involved", () => {
      const a = sim([{ ...bare, merged: effect }], { groupName: "frontend" });
      const b = sim([{ ...matched(0, [["matchDepTypes", ["dependencies"]]]), merged: effect }], {
        groupName: "frontend",
      });
      const cmp = compareSimulations(a, b, { mode: "config" });
      expect(cmp.identity.signatureChanges[0]?.kind).toBe("clause-rewritten");
      expect(cmp.identity.signatureChanges[0]?.keys).toEqual([
        "matchDepTypes",
        "matchPackageNames",
      ]);
      expect(cmp.summary).toBe(
        "identical: the same effective config results (a rule's selectors were rewritten)",
      );
    });

    /** One config file read through two dependencies: no selector text can
     *  have changed, because there is only one copy of it. One input flips a
     *  sentence that used to be unconditional. */
    it("calls the pair a different rule in dependency mode", () => {
      const wide = matched(0, [["matchPackageNames", ["react", "vue"]]]);
      const narrow = matched(0, [["matchPackageNames", ["react"]]]);
      const a = sim([{ ...wide, merged: effect }], { groupName: "frontend" });
      const b = sim([{ ...narrow, merged: effect }], { groupName: "frontend" });
      const cmp = compareSimulations(a, b, { mode: "dependency" });
      expect(cmp.mode).toBe("dependency");
      expect(cmp.identity.signatureChanges[0]?.kind).toBe("different-rule");
      expect(cmp.identity.signatureChanges[0]?.keys).toEqual([]);
      expect(cmp.summary).toBe(
        "identical: the same effective config results " +
          "(a different rule produced the same effect for each dependency)",
      );
    });

    it("defaults to unspecified rather than guessing an axis", () => {
      const a = sim([{ ...bare, merged: effect }], { groupName: "frontend" });
      expect(compareSimulations(a, a).mode).toBe("unspecified");
    });
  });

  /**
   * `description` is prose Renovate accumulates from every matched rule, so it
   * moves whenever the matched-rule set does. Calling that a behavior change
   * is as wrong as hiding it: it gets its own verdict, and it never headlines
   * a delta that has behavioral keys in it.
   */
  describe("documentation keys", () => {
    const rule = matched(0, [["matchPackageNames", ["react"]]]);

    it("gives a description-only delta its own verdict", () => {
      const a = simWritten([rule], { description: ["Group the react packages."] });
      const b = simWritten([rule], { description: ["Group all frontend packages."] });
      const cmp = compareSimulations(a, b, { mode: "config" });
      expect(cmp.verdict).toBe("documentation-only");
      expect(cmp.configDelta.map((delta) => delta.kind)).toEqual(["documentation"]);
      expect(cmp.summary).toBe(
        "documentation-only: only description changed — documentation text, " +
          "no behavioral difference",
      );
    });

    it("files description behind the behavioral keys when both moved", () => {
      const a = simWritten([rule], { automerge: false, description: ["Group react."] });
      const b = simWritten([rule], { automerge: true, description: ["Group all of frontend."] });
      const cmp = compareSimulations(a, b, { mode: "config" });
      expect(cmp.verdict).toBe("differs");
      expect(cmp.summary).toBe(
        "differs: automerge (A=false, B=true); description also changed (documentation)",
      );
    });

    it("orders the delta behavioral-first, alphabetical within group", () => {
      const a = simWritten([rule], {
        automerge: false,
        description: ["Group react."],
        groupName: "old",
      });
      const b = simWritten([rule], {
        automerge: true,
        description: ["Group all of frontend."],
        groupName: "new",
      });
      const cmp = compareSimulations(a, b, { mode: "config" });
      expect(cmp.configDelta.map((delta) => delta.key)).toEqual([
        "automerge",
        "groupName",
        "description",
      ]);
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

    it("names the changed keys, with direction and values", () => {
      const a = simWritten([matched(0, [["matchManagers", ["npm"]]])], { groupName: "old" });
      const b = simWritten([matched(0, [["matchManagers", ["npm"]]])], {
        groupName: "new",
        labels: [],
      });
      expect(compareSimulations(a, b, { mode: "config" }).summary).toBe(
        'differs: groupName (A="old", B="new"), labels (unset in A, B=[])',
      );
    });

    /** Replay-02 N8, in the surface an agent actually reads: a side nothing
     *  wrote is a default, and the summary says so rather than asserting a
     *  value the config never contained. */
    it("marks a side the config never set as a default", () => {
      const a = sim([matched(0, [["matchManagers", ["npm"]]])], { automerge: false });
      const b = simWritten([matched(0, [["matchManagers", ["npm"]]])], { automerge: true });
      expect(compareSimulations(a, b, { mode: "config" }).summary).toBe(
        "differs: automerge (A=false by default, B=true)",
      );
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
      expect(compareSimulations(a, b, { mode: "config" }).summary).toBe(
        "identical: the same effective config results (a rule's matchPackageNames list changed)",
      );
    });

    it("says identical without the caveat when nothing moved at all", () => {
      const a = sim([{ ...wide, merged: effect }], { groupName: "frontend" });
      expect(compareSimulations(a, a).summary).toBe(
        "identical: the same rules matched and the same effective config results",
      );
    });

    it("stops naming keys, and stops annotating them, once it would stop being a line", () => {
      const many = Object.fromEntries(
        Array.from({ length: 9 }, (_, i) => [`key${i}`, `a value far too long to annotate ${i}`]),
      ) as Record<string, unknown>;
      const cmp = compareSimulations(sim([], {}), sim([], many), { mode: "config" });
      expect(cmp.summary).toBe("differs: key0, key1, key2, key3, key4, key5 and 3 more");
    });
  });

  it("pairs duplicate-signature matched rules as a multiset", () => {
    const clause: [string, unknown][] = [["matchDatasources", ["npm"]]];
    const a = sim([matched(0, clause), matched(1, clause)], {});
    const b = sim([matched(0, clause)], {});
    const cmp = compareSimulations(a, b);
    expect(cmp.matchedInBoth).toHaveLength(1);
    expect(cmp.identity.onlyInA).toHaveLength(1);
    expect(cmp.identity.onlyInB).toHaveLength(0);
  });

  /** `summary` is `${verdict}: ${netEffect}`, and `netEffect` exists so no
   *  consumer has to slice a string to headline the result in its own voice. */
  it("states the net effect separately from the verdict prefix", () => {
    const a = simWritten([matched(0, [["matchManagers", ["npm"]]])], { automerge: false });
    const b = simWritten([matched(0, [["matchManagers", ["npm"]]])], { automerge: true });
    const cmp = compareSimulations(a, b, { mode: "config" });
    expect(cmp.netEffect).toBe("automerge (A=false, B=true)");
    expect(cmp.summary).toBe(`${cmp.verdict}: ${cmp.netEffect}`);
  });
});
