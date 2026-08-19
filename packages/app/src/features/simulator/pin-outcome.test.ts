/**
 * Roadmap 075 (iteration 6): what a pin card says about a simulation.
 *
 * The two things locked here are the ones a reader would be misled by if they
 * drifted: the chips (which read the same `finalDependencyConfig` the verdict
 * sentence reads), and the bucketing — every non-matching rule is counted
 * exactly once, the reader's OWN rules are never swallowed by a bucket, and the
 * cut falls back to an honest pair when the run has no provenance to group by.
 */
import type {
  ClauseEvaluation,
  ProvenanceLayer,
  RuleAttribution,
  RuleEvaluation,
  SimulationResult,
} from "@renovate-config-debugger/engine";
import { describe, expect, test } from "vitest";
import { buildPinOutcome } from "./pin-outcome";

function clause(state: ClauseEvaluation["state"]): ClauseEvaluation {
  return {
    key: "matchSourceUrls",
    value: ["x"],
    state,
    inputValues: {},
    readFields: ["sourceUrl"],
  };
}

function rule(
  index: number,
  verdict: RuleEvaluation["verdict"],
  clauses: ClauseEvaluation[] = [],
): RuleEvaluation {
  return { index, verdict, clauses, notes: [] };
}

function simulation(
  rules: RuleEvaluation[],
  finalDependencyConfig: Record<string, unknown> = {},
  updateType = "minor",
): SimulationResult {
  return {
    rules,
    missingInputs: { rules: 0, groups: [] },
    evaluationErrors: { rules: 0, selectors: [], messages: [], sampleRuleIndexes: [] },
    rawFinalConfig: {},
    finalDependencyConfig,
    flattened: { updateType, merged: [], blocks: {}, authoredBlocks: [] },
    mergeSteps: [],
    errors: [],
    warnings: [],
    notes: [],
  };
}

const REPO: ProvenanceLayer = { kind: "repo" };
const RECOMMENDED: ProvenanceLayer = {
  kind: "preset",
  name: "config:recommended",
  nodeId: "n1",
};
const MONOREPO: ProvenanceLayer = { kind: "preset", name: "group:monorepos", nodeId: "n2" };

function layers(entries: [number, ProvenanceLayer][]): Map<number, ProvenanceLayer> {
  return new Map(entries);
}

function attribution(entries: [number, ProvenanceLayer, number][]): RuleAttribution[] {
  return entries.map(([index, layer, sourceIndex]) => ({ index, layer, sourceIndex }));
}

describe("the header chips", () => {
  test("name the grouping and the automerge the rules produced", () => {
    const outcome = buildPinOutcome(
      simulation([rule(0, "matched", [clause("matched")])], {
        groupName: "react",
        automerge: true,
      }),
      layers([[0, REPO]]),
      attribution([[0, REPO, 0]]),
    );
    expect(outcome.chips).toEqual([
      { tone: "accent", label: "grouped: react" },
      { tone: "ok", label: "automerge ✓" },
    ]);
    expect(outcome.updateType).toBe("minor");
    expect(outcome.matched.map((r) => r.index)).toEqual([0]);
  });

  test("say so plainly when the matched rules changed nothing worth a chip", () => {
    const outcome = buildPinOutcome(simulation([]), layers([]), null);
    expect(outcome.chips).toEqual([{ tone: "muted", label: "default behavior" }]);
  });

  test("lead with an update Renovate would not raise at all", () => {
    const outcome = buildPinOutcome(
      simulation([], { skipReason: "disabled-by-config", groupName: "react" }),
      layers([]),
      null,
    );
    expect(outcome.chips[0]).toEqual({ tone: "warn", label: "skipped: disabled-by-config" });
  });
});

describe("the rules a card names and the ones it counts", () => {
  const RULES = [
    rule(0, "matched", [clause("matched")]),
    // the reader's own rule, genuinely mismatched — never bucketed
    rule(1, "no-match", [clause("no-match")]),
    rule(2, "no-match", [clause("no-match")]),
    rule(3, "no-match", [clause("no-match")]),
    rule(4, "no-match", [clause("no-input")]),
    rule(5, "no-match", [clause("error")]),
  ];
  const LAYERS = layers([
    [0, RECOMMENDED],
    [1, REPO],
    [2, RECOMMENDED],
    [3, MONOREPO],
    [4, RECOMMENDED],
    [5, MONOREPO],
  ]);
  const ATTRIBUTION = attribution([
    [0, RECOMMENDED, 0],
    [1, REPO, 2],
    [2, RECOMMENDED, 1],
    [3, MONOREPO, 0],
    [4, RECOMMENDED, 2],
    [5, MONOREPO, 1],
  ]);

  test("names the reader's own failed rule and buckets the rest, counting each once", () => {
    const outcome = buildPinOutcome(simulation(RULES), LAYERS, ATTRIBUTION);
    expect(outcome.matched.map((r) => r.index)).toEqual([0]);
    // The repo rule is named, with the index it has in the reader's own config
    // — the number the editor jump needs.
    expect(outcome.failed).toHaveLength(1);
    expect(outcome.failed[0]?.index).toBe(1);
    expect(outcome.failed[0]?.repoIndex).toBe(2);
    expect(outcome.failed[0]?.label).toContain("failed on matchSourceUrls");

    const byId = Object.fromEntries(outcome.buckets.map((b) => [b.id, b]));
    expect(byId["preset:config:recommended"]?.count).toBe(1);
    expect(byId["preset:group:monorepos"]?.count).toBe(1);
    expect(byId["missing-input"]?.count).toBe(1);
    expect(byId["not-evaluated"]?.count).toBe(1);
    // Every non-matching rule that is not the reader's own is in exactly one
    // bucket: 5 rules, 1 matched, 1 named, 4 counted.
    const bucketed = outcome.buckets.reduce((sum, b) => sum + b.count, 0);
    expect(bucketed).toBe(RULES.length - outcome.matched.length - outcome.failed.length);
    expect(outcome.totalRules).toBe(RULES.length);
  });

  test("a preset rule that lost to an unset field is not counted as a mismatch", () => {
    const outcome = buildPinOutcome(simulation(RULES), LAYERS, ATTRIBUTION);
    const preset = outcome.buckets.find((b) => b.id === "preset:config:recommended");
    expect(preset?.samples).toEqual([2]);
    expect(outcome.buckets.find((b) => b.id === "missing-input")?.samples).toEqual([4]);
  });

  test("falls back to two honest buckets when the run has no provenance", () => {
    const outcome = buildPinOutcome(simulation(RULES), layers([]), null);
    expect(outcome.failed).toEqual([]);
    expect(outcome.buckets.map((b) => b.label)).toEqual([
      "preset rules that didn’t match",
      "rules missing an input",
      "rules the tool could not evaluate",
    ]);
    // 4 genuine mismatches (rule 1 is nobody's own without provenance) + the
    // two verdict buckets.
    expect(outcome.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(5);
  });

  test("rolls the tail of a long provenance list into one bucket, never truncating the count", () => {
    const manyLayers: [number, ProvenanceLayer][] = [];
    const rules: RuleEvaluation[] = [];
    for (let i = 0; i < 8; i++) {
      rules.push(rule(i, "no-match", [clause("no-match")]));
      manyLayers.push([i, { kind: "preset", name: `preset-${i}`, nodeId: `n${i}` }]);
    }
    const outcome = buildPinOutcome(simulation(rules), layers(manyLayers), null);
    expect(outcome.buckets).toHaveLength(4);
    expect(outcome.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(8);
    expect(outcome.buckets.at(-1)?.label).toBe("rules from other sources that didn’t match");
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
