/**
 * The rules drawer's two filter facets. The verdict facet has to split a
 * fail-closed "no match — input not set" from a genuine mismatch exactly the
 * way the badge does (Replay-02 R3/R4 — one predicate, `isNoInputNoMatch`),
 * and `ruleVisible` has to be the SAME predicate the cross-link focus uses to
 * decide whether a row is hidden. Both are locked here.
 */
import type {
  ClauseEvaluation,
  ProvenanceLayer,
  RuleAttribution,
  RuleEvaluation,
} from "@renovate-config-debugger/engine";
import { describe, expect, test } from "vitest";
import {
  ALL_PRESETS,
  DEFAULT_RULE_FILTERS,
  filterRules,
  filterRulesBySource,
  presetFilterOptions,
  REPO_RULES,
  ruleLayerIndex,
  ruleVisible,
  verdictFilterOptions,
} from "./rule-filters";

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

const REPO_LAYER: ProvenanceLayer = { kind: "repo" };
const PRESET_LAYER: ProvenanceLayer = { kind: "preset", name: "config:recommended", nodeId: "n1" };

// 0 matched (repo) · 1 no-input (preset) · 2 no-match (preset) · 3 not-simulated (preset)
const RULES = [
  rule(0, "matched", [clause("matched")]),
  rule(1, "no-match", [clause("no-input")]),
  rule(2, "no-match", [clause("no-match")]),
  rule(3, "not-simulated"),
];
const LAYERS = new Map<number, ProvenanceLayer>([
  [0, REPO_LAYER],
  [1, PRESET_LAYER],
  [2, PRESET_LAYER],
  [3, PRESET_LAYER],
]);

const indices = (rules: RuleEvaluation[]) => rules.map((r) => r.index);

describe("the verdict facet", () => {
  test("the default view keeps everything that is not a plain no-match", () => {
    expect(indices(filterRules(RULES, DEFAULT_RULE_FILTERS, LAYERS))).toEqual([0, 3]);
  });

  test("no-input and no-match are separate facets, split like the badge", () => {
    const at = (verdict: "all" | "matched" | "no-input" | "no-match") =>
      indices(filterRules(RULES, { verdict, preset: ALL_PRESETS }, LAYERS));
    expect(at("all")).toEqual([0, 1, 2, 3]);
    expect(at("matched")).toEqual([0]);
    expect(at("no-input")).toEqual([1]);
    expect(at("no-match")).toEqual([2]);
  });
});

describe("the provenance facet", () => {
  test("narrowing to the repo layer is the old 'my rules only'", () => {
    // Note the verdict facet stays at its default: the two facets compose.
    expect(indices(filterRules(RULES, { verdict: "all", preset: REPO_RULES }, LAYERS))).toEqual([
      0,
    ]);
  });

  test("a rule with no attribution is hidden by any narrowed preset facet", () => {
    const orphan = rule(9, "matched");
    expect(ruleVisible(orphan, { verdict: "all", preset: REPO_RULES }, LAYERS)).toBe(false);
    expect(ruleVisible(orphan, { verdict: "all", preset: ALL_PRESETS }, LAYERS)).toBe(true);
  });

  test("options carry their counts, most-contributing first", () => {
    expect(presetFilterOptions(RULES, LAYERS, ALL_PRESETS)).toEqual([
      { value: "preset:config:recommended", label: "config:recommended", count: 3 },
      { value: "repo", label: "repo config", count: 1 },
    ]);
  });

  test("a selected layer the run no longer has stays listed, at zero", () => {
    const options = presetFilterOptions(RULES, LAYERS, "preset:group:monorepos");
    expect(options).toContainEqual({
      value: "preset:group:monorepos",
      label: "group:monorepos",
      count: 0,
    });
  });
});

describe("the source facet (rcd --source)", () => {
  test("repo and presets are the two halves a CLI flag can name", () => {
    expect(indices(filterRulesBySource(RULES, "all", LAYERS))).toEqual([0, 1, 2, 3]);
    expect(indices(filterRulesBySource(RULES, "repo", LAYERS))).toEqual([0]);
    expect(indices(filterRulesBySource(RULES, "presets", LAYERS))).toEqual([1, 2, 3]);
  });

  test("a rule with no attribution is hidden by either narrowed source", () => {
    const orphan = [rule(9, "matched")];
    expect(filterRulesBySource(orphan, "repo", LAYERS)).toEqual([]);
    expect(filterRulesBySource(orphan, "presets", LAYERS)).toEqual([]);
    expect(filterRulesBySource(orphan, "all", LAYERS)).toEqual(orphan);
  });
});

test("ruleLayerIndex turns the engine's attribution into the map the filters take", () => {
  const attribution: RuleAttribution[] = [
    { index: 0, layer: REPO_LAYER, sourceIndex: 0 },
    { index: 1, layer: PRESET_LAYER, sourceIndex: 0 },
  ];
  expect([...ruleLayerIndex(attribution).entries()]).toEqual([
    [0, REPO_LAYER],
    [1, PRESET_LAYER],
  ]);
  expect(ruleLayerIndex(null).size).toBe(0);
});

test("the verdict options state what each would leave", () => {
  expect(verdictFilterOptions(RULES).map((o) => [o.value, o.count])).toEqual([
    ["notable", 2],
    ["all", 4],
    ["matched", 1],
    ["no-input", 1],
    ["no-match", 1],
  ]);
});
