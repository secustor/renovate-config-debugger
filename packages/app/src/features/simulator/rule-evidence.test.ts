/**
 * Roadmap 054 (variant A), layer 3: the rule popover's model. The claim under
 * test is the classification — which of a rule's writes reached the final
 * config and which a later stop took away, and WHICH stop that was — because
 * that is the sentence the card prints next to a struck-through value, and
 * getting it wrong would accuse the wrong rule.
 *
 * Fixtures are hand-written `MergeStop`s (same shapes as
 * `verdict-threads.test.ts`): a `merged` entry omits `before` for a key that
 * did not exist yet and omits `after` when the merge removed it.
 */
import type {
  ClauseEvaluation,
  MergedKey,
  ProvenanceLayer,
  RuleEvaluation,
  SimulationResult,
} from "@renovate-config-visualizer/engine";
import { describe, expect, test } from "vitest";
import type { MergeStop } from "./merge-stops";
import { buildRuleEvidence } from "./rule-evidence";

const PRESET_LAYER: ProvenanceLayer = { kind: "preset", nodeId: "n1", name: "config:recommended" };

const MATCHED_CLAUSE: ClauseEvaluation = {
  key: "matchDatasources",
  value: ["npm"],
  state: "matched",
  inputValues: { datasource: "npm" },
  readFields: ["datasource"],
};

function stopChrome(id: string): Pick<MergeStop, "chip" | "step"> {
  return { chip: { label: id, ariaLabel: id }, step: { id, before: {}, after: {}, head: id } };
}

function ruleStop(ruleIndex: number, merged: MergedKey[]): MergeStop {
  return { kind: "rule", ruleIndex, merged, ...stopChrome(`rule-${ruleIndex}`) };
}

function flattenStop(merged: MergedKey[]): MergeStop {
  return { kind: "flatten", merged, ...stopChrome("flatten") };
}

function matchedRule(index: number): RuleEvaluation {
  return { index, verdict: "matched", clauses: [MATCHED_CLAUSE], notes: [] };
}

function simFixture(rules: RuleEvaluation[]): SimulationResult {
  return {
    rules,
    rawFinalConfig: {},
    finalDependencyConfig: {},
    flattened: { merged: [], blocks: {}, authoredBlocks: [] },
    mergeSteps: [],
    errors: [],
    warnings: [],
    notes: [],
  };
}

/** The mockup's scenario: rule 201 writes two keys in step 2; `schedule`
 *  survives, `groupName` is taken by rule 458 in step 3. */
const STOPS: MergeStop[] = [
  { kind: "base", ...stopChrome("base") },
  ruleStop(12, [{ key: "labels", before: [], after: ["deps"] }]),
  ruleStop(201, [
    { key: "schedule", before: ["at any time"], after: ["before 6am on monday"] },
    { key: "groupName", after: "npm minor+patch" },
  ]),
  ruleStop(458, [{ key: "groupName", before: "npm minor+patch", after: "oxlint monorepo" }]),
  { kind: "final", ...stopChrome("final") },
];
const LAYERS = new Map<number, ProvenanceLayer>([[201, PRESET_LAYER]]);
const SIM = simFixture([matchedRule(12), matchedRule(201), matchedRule(458)]);

describe("buildRuleEvidence", () => {
  test("classifies each write, naming the stop that overrode the lost one", () => {
    const evidence = buildRuleEvidence(201, STOPS, LAYERS, SIM);
    expect(evidence.stopOrdinal).toBe(2);
    expect(evidence.stopLabel).toBe("step 2 of 3");
    expect(evidence.stopIndex).toBe(2);
    expect(evidence.verdict).toBe("matched");
    expect(evidence.layer).toBe(PRESET_LAYER);
    expect(evidence.clauses).toEqual([MATCHED_CLAUSE]);
    expect(evidence.survivedCount).toBe(1);
    expect(evidence.writes).toEqual([
      {
        key: "schedule",
        before: ["at any time"],
        hadBefore: true,
        after: ["before 6am on monday"],
        hadAfter: true,
        survived: true,
        overriddenAtStopIndex: undefined,
        overriddenAtOrdinal: undefined,
        overriddenAtLabel: undefined,
      },
      {
        key: "groupName",
        before: undefined,
        // The key did not exist before this rule ran — a `+` write, not a `~`.
        hadBefore: false,
        after: "npm minor+patch",
        hadAfter: true,
        survived: false,
        overriddenAtStopIndex: 3,
        overriddenAtOrdinal: 3,
        overriddenAtLabel: "step 3 of 3",
      },
    ]);
  });

  test("the LAST word is not what overrode a write — the next stop that took it is", () => {
    const stops = [
      ruleStop(1, [{ key: "groupName", after: "a" }]),
      ruleStop(2, [{ key: "groupName", before: "a", after: "b" }]),
      ruleStop(3, [{ key: "groupName", before: "b", after: "c" }]),
    ];
    const [write] = buildRuleEvidence(1, stops, new Map(), simFixture([])).writes;
    expect(write?.overriddenAtOrdinal).toBe(2);
  });

  test("a flatten stop can be the overrider, and is named rather than numbered", () => {
    const stops = [
      ruleStop(4, [{ key: "automerge", after: true }]),
      flattenStop([{ key: "automerge", before: true, after: false }]),
    ];
    const [write] = buildRuleEvidence(4, stops, new Map(), simFixture([])).writes;
    expect(write?.survived).toBe(false);
    expect(write?.overriddenAtLabel).toBe("flatten step");
    expect(write?.overriddenAtOrdinal).toBeUndefined();
  });

  test("a removed key is a write like any other, and can itself be overridden", () => {
    const stops = [
      ruleStop(0, [{ key: "schedule", before: ["on monday"] }]),
      ruleStop(1, [{ key: "schedule", after: ["at any time"] }]),
    ];
    const [write] = buildRuleEvidence(0, stops, new Map(), simFixture([])).writes;
    expect(write?.hadAfter).toBe(false);
    expect(write?.hadBefore).toBe(true);
    expect(write?.survived).toBe(false);
    expect(write?.overriddenAtLabel).toBe("step 2 of 2");
  });

  test("a rule with no merge stop keeps its clause evidence and writes nothing", () => {
    const evidence = buildRuleEvidence(
      12,
      [ruleStop(3, [{ key: "labels", after: [] }])],
      new Map(),
      {
        ...simFixture([{ index: 12, verdict: "no-match", clauses: [MATCHED_CLAUSE], notes: [] }]),
      },
    );
    expect(evidence.stopLabel).toBeUndefined();
    expect(evidence.writes).toEqual([]);
    expect(evidence.survivedCount).toBe(0);
    expect(evidence.verdict).toBe("no-match");
    expect(evidence.clauses).toEqual([MATCHED_CLAUSE]);
  });

  test("without a simulation there is no verdict and no clause evidence", () => {
    const evidence = buildRuleEvidence(201, STOPS, LAYERS, null);
    expect(evidence.verdict).toBeUndefined();
    expect(evidence.clauses).toEqual([]);
    // The stops still say what the rule merged and what became of it.
    expect(evidence.writes).toHaveLength(2);
    expect(evidence.survivedCount).toBe(1);
  });
});
