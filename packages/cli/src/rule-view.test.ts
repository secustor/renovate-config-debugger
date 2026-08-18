import { describe, expect, test } from "vitest";
import type {
  RuleEvaluation,
  SimulationResult,
  TraceResult,
} from "@renovate-config-debugger/engine";
import { buildRuleView, missingInputsNote } from "./rule-view";

/**
 * The facets themselves are the app's shared predicates, covered where they
 * live. What is this module's own is the DIAGNOSTIC it emits when `--source`
 * has nothing to filter with — and, roadmap 068 (M2), whose vocabulary that
 * diagnostic speaks: an agent over MCP cannot pass a flag, and telling it to
 * is worse than saying nothing.
 */

function rule(index: number, verdict: RuleEvaluation["verdict"]): RuleEvaluation {
  return { index, verdict, clauses: [], notes: [] };
}

function sim(rules: RuleEvaluation[]): SimulationResult {
  return {
    rules,
    rawFinalConfig: {},
    finalDependencyConfig: {},
    flattened: { merged: [], blocks: {}, authoredBlocks: [] },
    missingInputs: { rules: 0, groups: [] },
    mergeSteps: [],
    errors: [],
    warnings: [],
    notes: [],
  };
}

/** A run whose preset resolution never completed: no rule can be attributed to
 *  a config level, which is exactly when the note fires. */
const UNATTRIBUTABLE = {
  events: [],
  finalConfig: { packageRules: [{ groupName: "x" }] },
  errors: [],
  warnings: [],
  presetTree: undefined,
} as unknown as TraceResult;

/** A run whose repo layer wrote both rules — enough for the replay in
 *  `computeRuleProvenance` to attribute them. */
const REPO_RULES = [{ groupName: "a" }, { groupName: "b" }];
const ATTRIBUTED = {
  events: [],
  errors: [],
  warnings: [],
  finalConfig: { packageRules: REPO_RULES },
  presetTree: {
    id: "root",
    name: "renovate.json",
    state: "resolved",
    children: [],
    input: { packageRules: REPO_RULES },
    resolved: { packageRules: REPO_RULES },
  },
} as unknown as TraceResult;

describe("buildRuleView", () => {
  test("`--source` with no provenance is dropped, and the CLI note says so in flags", () => {
    const view = buildRuleView(sim([rule(0, "matched")]), UNATTRIBUTABLE, {
      verdict: "all",
      source: "repo",
      explicit: true,
      transport: "cli",
    });
    expect(view.notes[0]).toContain("--source repo ignored");
    // Dropped, not applied: filtering every rule away because the attribution
    // is missing would be a wrong answer, not a narrow one.
    expect(view.source).toBe("all");
    expect(view.rules).toHaveLength(1);
  });

  test("the same note over MCP names the tool parameter instead", () => {
    const view = buildRuleView(sim([rule(0, "matched")]), UNATTRIBUTABLE, {
      verdict: "all",
      source: "presets",
      explicit: true,
      transport: "mcp",
    });
    expect(view.notes[0]).toContain('source: "presets" ignored');
    expect(view.notes[0]).not.toContain("--source");
  });

  /**
   * Roadmap 071: the attribution is computed whatever `--source` says, because
   * it also answers "which layer wrote this MATCHED rule" — a question the
   * filter never asks and every caller has.
   */
  test("the sources legend and the per-rule origin come back unasked", () => {
    const view = buildRuleView(sim([rule(0, "matched"), rule(1, "no-match")]), ATTRIBUTED, {
      verdict: "all",
      // No `--source`: the attribution is not the filter's private business.
      source: "all",
      explicit: false,
      transport: "cli",
    });
    expect(view.sources).toEqual([{ layer: "repo", kind: "repo", from: 0, to: 1, count: 2 }]);
    expect(view.originOf(1)).toEqual({ layer: "repo", sourceIndex: 1 });
  });

  test("an unattributable run has no sources, and links nothing", () => {
    const view = buildRuleView(sim([rule(0, "matched")]), UNATTRIBUTABLE, {
      verdict: "all",
      source: "all",
      explicit: false,
      transport: "cli",
    });
    expect(view.sources).toEqual([]);
    expect(view.originOf(0)).toBeUndefined();
    // …and the existing behavior is untouched: nothing was filtered, so
    // nothing is reported.
    expect(view.notes).toEqual([]);
  });

  test("the verdict facet counts what it hid", () => {
    const view = buildRuleView(sim([rule(0, "matched"), rule(1, "no-match")]), UNATTRIBUTABLE, {
      verdict: "matched",
      source: "all",
      explicit: true,
      transport: "cli",
    });
    expect(view.rules).toHaveLength(1);
    expect(view.total).toBe(2);
    expect(view.hidden).toBe(1);
    expect(view.notes).toEqual([]);
  });
});

/** The engine owns the sentence; this layer owns the pointer at its end — and
 *  the pointer is the half that differs per surface. */
describe("missingInputsNote", () => {
  const SUMMARY = {
    rules: 2,
    groups: [
      {
        fields: ["sourceUrl"],
        fieldList: "sourceUrl",
        selectors: ["matchSourceUrls"],
        rules: 2,
        sampleRuleIndexes: [0, 2],
      },
    ],
    note: "2 of 4 rules could not match because the simulated dependency has no sourceUrl.",
  };

  test("the CLI is told the flag it can type", () => {
    expect(missingInputsNote(SUMMARY, "cli")).toBe(
      `${SUMMARY.note} \`--verdict no-input\` lists them.`,
    );
  });

  test("an agent is told the parameter instead — it cannot pass a flag", () => {
    const note = missingInputsNote(SUMMARY, "mcp");
    expect(note).toBe(`${SUMMARY.note} \`verdict: "no-input"\` lists them.`);
    expect(note).not.toContain("--verdict");
  });

  test("nothing to say means no line at all", () => {
    expect(missingInputsNote({ rules: 0, groups: [] }, "cli")).toBeUndefined();
  });
});
