/**
 * What a funnel card says about a simulation (Proposal F rebuild).
 *
 * The things locked here are the ones a reader would be misled by if they
 * drifted: the headline (which reads the same `finalDependencyConfig` the
 * verdict sentence reads), the write survival on a matched rule (who beat
 * whom, straight from the merge steps), the reader's OWN rules never being
 * swallowed by a bucket, and the reason-cut bucketing counting every skipped
 * rule exactly once.
 */
import type {
  ClauseEvaluation,
  MergeStep,
  ProvenanceLayer,
  RuleAttribution,
  RuleEvaluation,
  SimulationResult,
} from "@renovate-config-debugger/engine";
import { describe, expect, test } from "vitest";
import { clauseEval, ruleEval as rule, simResult } from "@tools/test/simulation";
import { buildPinOutcome, dotTitle, dotTone, headSummary, pinCheck } from "./pin-outcome";

function clause(
  state: ClauseEvaluation["state"],
  key = "matchSourceUrls",
  value: unknown = ["x"],
  inputValues: Record<string, unknown> = {},
): ClauseEvaluation {
  return clauseEval(state, { key, value, inputValues });
}

function simulation(
  rules: RuleEvaluation[],
  finalDependencyConfig: Record<string, unknown> = {},
  updateType = "minor",
  mergeSteps: MergeStep[] = [],
) {
  return simResult({
    rules,
    finalDependencyConfig,
    flattened: { updateType, merged: [], blocks: {}, authoredBlocks: [] },
    mergeSteps,
  });
}

const REPO: ProvenanceLayer = { kind: "repo" };
const RECOMMENDED: ProvenanceLayer = {
  kind: "preset",
  name: "config:recommended",
  nodeId: "n1",
};
const ANGULAR: ProvenanceLayer = { kind: "preset", name: "monorepo:angular", nodeId: "n2" };
const AWS: ProvenanceLayer = { kind: "preset", name: "monorepo:aws", nodeId: "n3" };
const REPLACEMENTS: ProvenanceLayer = { kind: "preset", name: "replacements:all", nodeId: "n4" };

function layers(entries: [number, ProvenanceLayer][]): Map<number, ProvenanceLayer> {
  return new Map(entries);
}

function attribution(entries: [number, ProvenanceLayer, number][]): RuleAttribution[] {
  return entries.map(([index, layer, sourceIndex]) => ({ index, layer, sourceIndex }));
}

describe("the headline", () => {
  test("names the grouping and the automerge the rules produced, with the counts", () => {
    const outcome = buildPinOutcome(
      simulation([rule(0, "matched", [clause("matched")])], {
        groupName: "react",
        automerge: true,
      }),
      layers([[0, REPO]]),
      attribution([[0, REPO, 0]]),
    );
    expect(outcome.headline).toBe("grouped as “react” · automerge ✓");
    expect(outcome.updateType).toBe("minor");
    expect(outcome.matched.map((r) => r.index)).toEqual([0]);
    expect(outcome.skippedCount).toBe(0);
  });

  test("an update nothing wrote to says the defaults apply", () => {
    const outcome = buildPinOutcome(
      simulation([rule(0, "no-match", [clause("no-match")])]),
      layers([]),
      null,
    );
    expect(outcome.headline).toBe("0 matched — defaults apply");
    expect(outcome.skippedCount).toBe(1);
  });

  test("leads with an update Renovate would not raise at all", () => {
    const outcome = buildPinOutcome(
      simulation([], { skipReason: "disabled-by-config", groupName: "react" }),
      layers([]),
      null,
    );
    expect(outcome.chips[0]).toEqual({ tone: "warn", label: "skipped: disabled-by-config" });
  });
});

describe("what a matched rule wrote, against the merge steps", () => {
  const RULES = [rule(0, "matched", [clause("matched")]), rule(1, "matched", [clause("matched")])];
  const STEPS: MergeStep[] = [
    {
      kind: "rule",
      ruleIndex: 0,
      before: {},
      after: {},
      merged: [{ key: "groupName", after: "react monorepo" }],
    },
    {
      kind: "rule",
      ruleIndex: 1,
      before: {},
      after: {},
      merged: [{ key: "groupName", before: "react monorepo", after: "npm minor" }],
    },
  ];

  test("an overridden write says who took it, a surviving one says who it beat", () => {
    const outcome = buildPinOutcome(
      simulation(RULES, {}, "minor", STEPS),
      layers([
        [0, RECOMMENDED],
        [1, REPO],
      ]),
      null,
    );
    const [first, second] = outcome.matched;
    expect(first?.wroteSummary).toBe("groupName · overridden below");
    expect(first?.conflictNote).toBe("packageRules[1] runs later and rewrote groupName.");
    expect(second?.wroteSummary).toBe("groupName · wins");
    expect(second?.conflictNote).toBe("Applied later — its groupName wins over packageRules[0].");
  });

  // Three writers of one key: the note must name the LAST earlier stop — the
  // value rule 2 replaced was rule 1's, never rule 0's.
  test("a surviving write names the last earlier stop it beat, not the first", () => {
    const rules = [0, 1, 2].map((i) => rule(i, "matched", [clause("matched")]));
    const steps: MergeStep[] = [
      {
        kind: "rule",
        ruleIndex: 0,
        before: {},
        after: {},
        merged: [{ key: "groupName", after: "a" }],
      },
      {
        kind: "rule",
        ruleIndex: 1,
        before: {},
        after: {},
        merged: [{ key: "groupName", before: "a", after: "b" }],
      },
      {
        kind: "rule",
        ruleIndex: 2,
        before: {},
        after: {},
        merged: [{ key: "groupName", before: "b", after: "c" }],
      },
    ];
    const outcome = buildPinOutcome(simulation(rules, {}, "minor", steps), layers([]), null);
    expect(outcome.matched[2]?.wroteSummary).toBe("groupName · wins");
    expect(outcome.matched[2]?.conflictNote).toBe(
      "Applied later — its groupName wins over packageRules[1].",
    );
  });

  test("a matched rule that merged nothing says so", () => {
    const outcome = buildPinOutcome(
      simulation([rule(0, "matched", [clause("matched")])]),
      layers([]),
      null,
    );
    expect(outcome.matched[0]?.wroteSummary).toBe("no writes");
    expect(outcome.matched[0]?.conflictNote).toBeUndefined();
  });
});

describe("the rules a card names and the ones it buckets", () => {
  const RULES = [
    rule(0, "matched", [clause("matched")]),
    // the reader's own rule, genuinely mismatched — never bucketed
    rule(1, "no-match", [
      clause("matched", "matchManagers", ["npm"], { manager: "npm" }),
      clause("no-match", "matchUpdateTypes", ["patch"], { updateType: "minor" }),
    ]),
    rule(2, "no-match", [clause("no-match")]),
    rule(3, "no-match", [clause("no-match")]),
    rule(4, "no-match", [clause("no-match")]),
    rule(5, "no-match", [clause("no-match")]),
    rule(6, "no-match", [clause("no-input")]),
    rule(7, "no-match", [clause("error")]),
  ];
  const LAYERS = layers([
    [0, RECOMMENDED],
    [1, REPO],
    [2, ANGULAR],
    [3, ANGULAR],
    [4, AWS],
    [5, REPLACEMENTS],
    [6, RECOMMENDED],
    [7, RECOMMENDED],
  ]);
  const ATTRIBUTION = attribution([
    [0, RECOMMENDED, 0],
    [1, REPO, 2],
  ]);

  test("names the reader's own failed rule, with the index the editor jump needs", () => {
    const outcome = buildPinOutcome(simulation(RULES), LAYERS, ATTRIBUTION);
    expect(outcome.failed).toHaveLength(1);
    expect(outcome.failed[0]?.index).toBe(1);
    expect(outcome.failed[0]?.repoIndex).toBe(2);
    expect(outcome.failed[0]?.label).toContain("failed on matchUpdateTypes");
  });

  test("offers the one-edit fix when exactly one list clause failed", () => {
    const outcome = buildPinOutcome(simulation(RULES), LAYERS, ATTRIBUTION);
    expect(outcome.failed[0]?.closestMiss).toEqual({
      clauseKey: "matchUpdateTypes",
      suggestion: '["patch","minor"]',
    });
  });

  test("cuts the buckets by reason and counts every skipped rule exactly once", () => {
    const outcome = buildPinOutcome(simulation(RULES), LAYERS, ATTRIBUTION, "react");
    const byId = Object.fromEntries(outcome.buckets.map((b) => [b.id, b]));
    // monorepo:* rules grouped per family, biggest first.
    expect(byId["monorepo"]?.count).toBe(3);
    expect(byId["monorepo"]?.rows.map((r) => r.label)).toEqual([
      "monorepo:angular",
      "monorepo:aws",
    ]);
    expect(byId["monorepo"]?.rows[0]?.note).toContain("2 rules");
    // the replacements reason names the dependency.
    expect(byId["replacements"]?.count).toBe(1);
    expect(byId["replacements"]?.reason).toBe("replacement rules — react hasn’t been renamed");
    // verdict specials keep their own buckets.
    expect(byId["missing-input"]?.count).toBe(1);
    expect(byId["not-evaluated"]?.count).toBe(1);
    // Every skipped rule that is not the reader's own is in exactly one bucket.
    const bucketed = outcome.buckets.reduce((sum, b) => sum + b.count, 0);
    expect(bucketed).toBe(RULES.length - outcome.matched.length - outcome.failed.length);
    // The header count is total minus matched — the named failures included.
    expect(outcome.skippedCount).toBe(RULES.length - outcome.matched.length);
  });

  // `matchBaseBranches` is the registry's one -ches plural; a naive `s$` strip
  // printed "base branche" straight into the bucket's reason line.
  test("singularizes a sibilant selector for the axis reason", () => {
    const outcome = buildPinOutcome(
      simulation([
        rule(0, "no-match", [
          clause("no-match", "matchBaseBranches", ["next"], { baseBranch: "main" }),
        ]),
      ]),
      layers([]),
      null,
    );
    const bucket = outcome.buckets.find((b) => b.id === "other-axis");
    expect(bucket?.reason).toBe("matcher on a different axis (base branch)");
  });

  test("without provenance nothing is anyone's own, and the remainder is one axis bucket", () => {
    const outcome = buildPinOutcome(simulation(RULES), layers([]), null);
    expect(outcome.failed).toEqual([]);
    const byId = Object.fromEntries(outcome.buckets.map((b) => [b.id, b]));
    expect(byId["other-axis"]?.count).toBe(5);
    expect(outcome.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(7);
  });

  /** The shared fixture leaves `missingInputs` empty, and the no-input rows
   *  are built from nothing else. */
  function simulationWithMissing(missingInputs: SimulationResult["missingInputs"]) {
    return simResult({
      rules: RULES,
      flattened: { updateType: "minor", merged: [], blocks: {}, authoredBlocks: [] },
      missingInputs,
    });
  }

  test("the no-input rows name the field, not the rule, and count the groups they elide", () => {
    const outcome = buildPinOutcome(
      simulationWithMissing({
        rules: 1,
        groups: [
          {
            fields: ["sourceUrl"],
            fieldList: "sourceUrl",
            selectors: ["matchSourceUrls"],
            rules: 2,
            sampleRuleIndexes: [6],
          },
          {
            fields: ["packageFile", "lockFiles"],
            fieldList: "packageFile or lockFiles",
            selectors: ["matchFileNames"],
            rules: 2,
            sampleRuleIndexes: [6],
          },
          {
            fields: ["categories"],
            fieldList: "categories",
            selectors: ["matchCategories"],
            rules: 1,
            sampleRuleIndexes: [6],
          },
          {
            fields: ["repository"],
            fieldList: "repository",
            selectors: ["matchRepositories"],
            rules: 1,
            sampleRuleIndexes: [6],
          },
        ],
      }),
      LAYERS,
      ATTRIBUTION,
      "react",
    );
    const bucket = outcome.buckets.find((b) => b.id === "missing-input");
    expect(bucket?.rows.map((r) => r.label)).toEqual([
      "sourceUrl",
      "packageFile or lockFiles",
      "categories",
    ]);
    expect(bucket?.rows[0]?.note).toBe(
      "2 rules read it — set it on this test to evaluate them for real (matchSourceUrls)",
    );
    expect(bucket?.rows[0]?.probeQuery).toBe("matchSourceUrls");
    expect(bucket?.more).toBe("1 more field group");
    // The count is the deduped rule count, never the group count: one rule
    // appears in two groups upstream.
    expect(bucket?.count).toBe(1);
  });

  test("a long family list keeps its count and says how much the rows elide", () => {
    const manyLayers: [number, ProvenanceLayer][] = [];
    const rules: RuleEvaluation[] = [];
    for (let i = 0; i < 8; i++) {
      rules.push(rule(i, "no-match", [clause("no-match")]));
      manyLayers.push([i, { kind: "preset", name: `monorepo:family-${i}`, nodeId: `n${i}` }]);
    }
    const outcome = buildPinOutcome(simulation(rules), layers(manyLayers), null);
    const bucket = outcome.buckets[0];
    expect(bucket?.count).toBe(8);
    expect(bucket?.rows).toHaveLength(3);
    expect(bucket?.more).toBe("5 more families, sorted by rule count");
  });
});

/**
 * The header derivations both cards read. They live here rather than in
 * `PinCard` because the one-off card re-spelled the dot as
 * `matched.length === 0 ? "warn" : "ok"` and so showed a GREEN dot for the very
 * outcome a pin of the same descriptor ambered — the caveat case below.
 */
describe("the header dot and the outcome sentence", () => {
  const MATCHED = buildPinOutcome(
    simulation([rule(0, "matched", [clause("matched")])], { groupName: "react" }),
    layers([[0, REPO]]),
    null,
  );
  const NO_MATCH = buildPinOutcome(
    simulation([rule(0, "no-match", [clause("no-match")])]),
    layers([]),
    null,
  );
  const CAVEATED = buildPinOutcome(
    simulation([
      rule(0, "matched", [clause("matched")]),
      rule(1, "no-match", [clause("no-input")]),
    ]),
    layers([
      [0, RECOMMENDED],
      [1, REPO],
    ]),
    attribution([[1, REPO, 0]]),
  );

  test("a pin with no evaluation yet is pending, not green", () => {
    const check = pinCheck(undefined, null);
    expect(check).toEqual({ status: "pending" });
    expect(dotTone(check)).toBe("pending");
    expect(dotTitle(check)).toBe("checking…");
  });

  test("a check that threw is amber and says so", () => {
    const check = pinCheck({ error: "boom" }, null);
    expect(check).toEqual({ status: "failed", error: "boom" });
    expect(dotTone(check)).toBe("warn");
    expect(dotTitle(check)).toBe("this pin could not be checked");
  });

  test("a caveat ambers a card whose rules DID match, and titles it with the caveat", () => {
    expect(CAVEATED.matched).toHaveLength(1);
    expect(CAVEATED.caveat).toBeDefined();
    const check = pinCheck({}, CAVEATED);
    expect(dotTone(check)).toBe("warn");
    expect(dotTitle(check)).toBe(CAVEATED.caveat);
  });

  test("an update no rule wrote to is amber; a clean match is green", () => {
    expect(dotTone(pinCheck({}, NO_MATCH))).toBe("warn");
    expect(dotTitle(pinCheck({}, NO_MATCH))).toBe("no rule matched — Renovate defaults apply");
    expect(dotTone(pinCheck({}, MATCHED))).toBe("ok");
    expect(dotTitle(pinCheck({}, MATCHED))).toBe("checked against the current run");
  });

  test("the sentence names the matched count only when there is one", () => {
    expect(headSummary(MATCHED)).toBe("grouped as “react” · 1 matched, 0 skipped");
    expect(headSummary(NO_MATCH)).toBe("0 matched — defaults apply · 1 skipped");
  });
});

test("the honesty caveat rides on the outcome (it is what ambers the card's dot)", () => {
  const rules = [rule(0, "no-match", [clause("no-input")])];
  const outcome = buildPinOutcome(
    simulation(rules),
    layers([[0, REPO]]),
    attribution([[0, REPO, 0]]),
  );
  expect(outcome.caveat).toContain("this result may not reflect a real Renovate run");
});
