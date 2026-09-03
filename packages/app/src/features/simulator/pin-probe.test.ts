/**
 * The probe: a substring scan across everything a reader knows a rule by. The
 * facts locked here: hit attribution follows field order (index before preset
 * before matchers), the total keeps counting past the render cap, long values
 * are clipped around the highlight before they reach a component, and the idle
 * suggestions come from the run itself so each one is guaranteed to hit.
 */
import type {
  ClauseEvaluation,
  MergeStep,
  ProvenanceLayer,
  RuleEvaluation,
} from "@renovate-config-debugger/engine";
import { describe, expect, test } from "vitest";
import { clauseEval, ruleEval as rule, simResult } from "@tools/test/simulation";
import { MAX_PROBE_HITS, probeRules, probeSuggestions } from "./pin-probe";
import type { RuleDescriptionNote } from "./rule-descriptions";

/** A matcher clause the probe scans by key and value; the probe never reads
 *  `readFields`, so the shared default is left in place. */
function clause(key: string, value: unknown): ClauseEvaluation {
  return clauseEval("no-match", { key, value });
}

function simulation(rules: RuleEvaluation[], mergeSteps: MergeStep[] = []) {
  return simResult({ rules, mergeSteps });
}

const ANGULAR: ProvenanceLayer = { kind: "preset", name: "monorepo:angular", nodeId: "n1" };

const SIM = simulation([
  rule(3, "no-match", [clause("matchPackageNames", ["@angular/cli", "@angular-devkit/build"])]),
  rule(7, "no-match", [clause("matchManagers", ["dockerfile"])]),
]);
const LAYERS = new Map<number, ProvenanceLayer>([[3, ANGULAR]]);
const NO_DESCRIPTIONS = new Map<number, RuleDescriptionNote>();

describe("where a hit is attributed", () => {
  test("the rule's own index wins over everything", () => {
    const { hits } = probeRules({
      sim: SIM,
      layerByIndex: LAYERS,
      descriptions: NO_DESCRIPTIONS,
      query: "packageRules[7]",
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.foundIn).toBe("index");
    expect(hits[0]?.hit).toBe("packageRules[7]");
  });

  test("a preset name hit says so, a matcher-value hit names the matcher", () => {
    const results = probeRules({
      sim: SIM,
      layerByIndex: LAYERS,
      descriptions: NO_DESCRIPTIONS,
      query: "angular",
    });
    expect(results.total).toBe(1);
    expect(results.hits[0]?.foundIn).toBe("preset");
    const byValue = probeRules({
      sim: SIM,
      layerByIndex: LAYERS,
      descriptions: NO_DESCRIPTIONS,
      query: "dockerfile",
    });
    expect(byValue.hits[0]?.foundIn).toBe("matchManagers");
    expect(byValue.hits[0]?.index).toBe(7);
  });

  test("a written option is searchable from the rule's BODY — matched or not", () => {
    const sim = simulation([rule(0, "matched", []), rule(1, "no-match", [])]);
    const bodies = [
      { matchPackageNames: ["react"], groupName: "react monorepo" },
      { matchUpdateTypes: ["patch"], automerge: true },
    ];
    const { hits } = probeRules({
      sim,
      layerByIndex: new Map(),
      descriptions: NO_DESCRIPTIONS,
      ruleBodies: bodies,
      query: "automerge",
    });
    // The rule never matched — it has no merge step — and its write is still
    // findable, because "which rule sets automerge?" is the probe's question.
    expect(hits[0]?.index).toBe(1);
    expect(hits[0]?.foundIn).toBe("writes");
    expect(hits[0]?.matched).toBe(false);
  });
});

test("the total keeps counting past the render cap", () => {
  const many = simulation(
    Array.from({ length: MAX_PROBE_HITS + 4 }, (_, i) =>
      rule(i, "no-match", [clause("matchManagers", ["dockerfile"])]),
    ),
  );
  const results = probeRules({
    sim: many,
    layerByIndex: new Map(),
    descriptions: NO_DESCRIPTIONS,
    query: "dockerfile",
  });
  expect(results.total).toBe(MAX_PROBE_HITS + 4);
  expect(results.hits).toHaveLength(MAX_PROBE_HITS);
});

test("long values are clipped around the highlight, with the ellipses saying so", () => {
  const sim = simulation([
    rule(0, "no-match", [clause("matchSourceUrls", [`${"x".repeat(60)}needle${"y".repeat(60)}`])]),
  ]);
  const { hits } = probeRules({
    sim,
    layerByIndex: new Map(),
    descriptions: NO_DESCRIPTIONS,
    query: "needle",
  });
  const hit = hits[0];
  expect(hit?.hit).toBe("needle");
  expect(hit?.pre.startsWith("…")).toBe(true);
  expect(hit?.post.endsWith("…")).toBe(true);
  expect((hit?.pre.length ?? 0) + (hit?.post.length ?? 0)).toBeLessThan(60);
});

test("an empty query probes nothing", () => {
  expect(
    probeRules({
      sim: SIM,
      layerByIndex: LAYERS,
      descriptions: NO_DESCRIPTIONS,
      query: "   ",
    }),
  ).toEqual({ total: 0, hits: [] });
});

test("the idle suggestions come from the run, so each one is guaranteed to hit", () => {
  const sim = simulation(
    [rule(0, "matched", []), rule(3, "no-match", [clause("matchPackageNames", ["@angular/cli"])])],
    [{ kind: "rule", ruleIndex: 0, before: {}, after: {}, merged: [{ key: "groupName" }] }],
  );
  const bodies: unknown[] = [{ groupName: "react monorepo" }, {}, {}, {}];
  const suggestions = probeSuggestions(sim, LAYERS);
  expect(suggestions).toEqual(["monorepo:angular", "groupName", "packageRules[3]"]);
  for (const query of suggestions) {
    const results = probeRules({
      sim,
      layerByIndex: LAYERS,
      descriptions: NO_DESCRIPTIONS,
      ruleBodies: bodies,
      query,
    });
    expect(results.total).toBeGreaterThan(0);
  }
});

test("a flatten step's key is never suggested — no rule body names it", () => {
  const sim = simulation(
    [rule(3, "no-match", [clause("matchPackageNames", ["@angular/cli"])])],
    [
      {
        kind: "flatten",
        updateType: "minor",
        before: {},
        after: {},
        merged: [{ key: "automerge" }],
      },
    ],
  );
  const bodies: unknown[] = [{}, {}, {}, {}];
  const suggestions = probeSuggestions(sim, LAYERS);
  expect(suggestions).not.toContain("automerge");
  for (const query of suggestions) {
    const results = probeRules({
      sim,
      layerByIndex: LAYERS,
      descriptions: NO_DESCRIPTIONS,
      ruleBodies: bodies,
      query,
    });
    expect(results.total).toBeGreaterThan(0);
  }
});
