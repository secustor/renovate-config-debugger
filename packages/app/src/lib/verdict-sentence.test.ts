/**
 * Replay-02 N4/R3: the verdict sentence is the simulator's most-screenshotted
 * string and shipped with no test at all — grammar and scoping defects lived
 * in the one artifact built to be quoted verbatim. Locks the assembled prose
 * (the shared "would" distributing over every positive, the config-scoped
 * automerge parenthetical) and the fail-closed no-input caveat, on
 * hand-written fixtures in the engine's real shapes (same discipline as
 * verdict-threads.test.ts).
 *
 * Roadmap 048: the assertions render through `verdictText`, the same function
 * `rcd simulate` and the MCP `simulate` tool answer with — so these strings
 * are the CLI's strings, not a second spelling of them.
 */
import type {
  ClauseEvaluation,
  RuleAttribution,
  RuleEvaluation,
  SimulationResult,
} from "@renovate-config-debugger/engine";
import { describe, expect, test } from "vitest";
import { buildNoInputCaveat, buildVerdictSegments, verdictText } from "./verdict-sentence";

function simFixture(
  finalDependencyConfig: Record<string, unknown>,
  overrides: Partial<SimulationResult> = {},
): SimulationResult {
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
    ...overrides,
  };
}

function noInputClause(key: string, readFields: string[]): ClauseEvaluation {
  return { key, value: ["x"], state: "no-input", inputValues: {}, readFields };
}

function noMatchClause(key: string): ClauseEvaluation {
  return {
    key,
    value: ["react"],
    state: "no-match",
    inputValues: { packageName: "lodash" },
    readFields: ["packageName"],
  };
}

function noMatchRule(index: number, clauses: ClauseEvaluation[]): RuleEvaluation {
  return { index, verdict: "no-match", clauses, notes: [] };
}

const REPO_ATTRIBUTION = (indices: number[]): RuleAttribution[] =>
  indices.map((index) => ({ index, sourceIndex: index, layer: { kind: "repo" } }));

describe("buildVerdictSegments", () => {
  test("the shared WOULD distributes over every positive, auto-approval included", () => {
    // The replay's broken ordering: automerge + labels + autoApprove read as
    // "would automerge, get labels […], and auto-approval" — a bare noun under
    // a verb-phrase modal.
    const sim = simFixture({ automerge: true, labels: ["deploy_pr"], autoApprove: true });
    expect(verdictText(buildVerdictSegments(sim, "minor", [], null))).toBe(
      "This minor update WOULD automerge, get labels [deploy_pr], and get auto-approval.",
    );
  });

  test("scoped automerge is attributed to the config, with its source preset", () => {
    const sim = simFixture(
      { labels: ["deploy_pr"], autoApprove: true },
      {
        flattened: {
          merged: [],
          blocks: { minor: { automerge: true }, patch: { automerge: true } },
          authoredBlocks: [],
        },
        rules: [
          {
            index: 5,
            verdict: "matched",
            clauses: [],
            notes: [],
            merged: [
              { key: "minor", after: { automerge: true } },
              { key: "patch", after: { automerge: true } },
            ],
          },
        ],
      },
    );
    const attribution: RuleAttribution[] = [
      {
        index: 5,
        sourceIndex: 0,
        layer: { kind: "preset", nodeId: "n1", name: ":automergeMinor" },
      },
    ];
    expect(verdictText(buildVerdictSegments(sim, "major", [], attribution))).toBe(
      "This major update WOULD get labels [deploy_pr] and get auto-approval, " +
        "but WOULD NOT automerge (your config enables automerge only for minor/patch updates — from `:automergeMinor`).",
    );
  });

  test("scoped automerge without a traceable source stays uncredited", () => {
    const sim = simFixture(
      {},
      {
        flattened: { merged: [], blocks: { minor: { automerge: true } }, authoredBlocks: [] },
      },
    );
    expect(verdictText(buildVerdictSegments(sim, "major", [], null))).toBe(
      "This major update WOULD NOT automerge (your config enables automerge only for minor updates).",
    );
  });

  test("nothing special renders the defaults sentence", () => {
    expect(verdictText(buildVerdictSegments(simFixture({}), "patch", [], null))).toBe(
      "This patch update gets no special handling from your matched rules — the defaults apply.",
    );
  });
});

describe("buildNoInputCaveat", () => {
  test("names every unset field behind a repo rule's fail-closed no-match", () => {
    // Two different fields on purpose: the caveat is field-agnostic, and must
    // not regress into sourceUrl-only handling.
    const sim = simFixture(
      {},
      {
        rules: [
          noMatchRule(0, [noInputClause("matchSourceUrls", ["sourceUrl"])]),
          noMatchRule(1, [noInputClause("matchCategories", ["categories"])]),
          noMatchRule(2, [noMatchClause("matchPackageNames")]),
        ],
      },
    );
    expect(buildNoInputCaveat(sim, REPO_ATTRIBUTION([0, 1, 2]))).toBe(
      "2 of your rules failed only because a field was left unset in this simulation " +
        "(sourceUrl, categories) — this result may not reflect a real Renovate run.",
    );
  });

  test("a rule that also mismatched real data earns no caveat", () => {
    const sim = simFixture(
      {},
      {
        rules: [
          noMatchRule(0, [
            noInputClause("matchSourceUrls", ["sourceUrl"]),
            noMatchClause("matchPackageNames"),
          ]),
        ],
      },
    );
    expect(buildNoInputCaveat(sim, REPO_ATTRIBUTION([0]))).toBeUndefined();
  });

  test("preset rules failing on unset side-channel fields are not a signal", () => {
    const sim = simFixture(
      {},
      { rules: [noMatchRule(0, [noInputClause("matchSourceUrls", ["sourceUrl"])])] },
    );
    const presetAttribution: RuleAttribution[] = [
      {
        index: 0,
        sourceIndex: 0,
        layer: { kind: "preset", nodeId: "n1", name: "config:recommended" },
      },
    ];
    expect(buildNoInputCaveat(sim, presetAttribution)).toBeUndefined();
    expect(buildNoInputCaveat(sim, null)).toBeUndefined();
  });
});
