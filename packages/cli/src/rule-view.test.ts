import { describe, expect, test } from "vitest";
import type {
  RuleEvaluation,
  SimulationResult,
  TraceResult,
} from "@renovate-config-debugger/engine";
import { buildRuleView } from "./rule-view";

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
