import { describe, expect, test } from "vitest";
import type {
  RuleEvaluation,
  SimulationResult,
  TraceResult,
} from "@renovate-config-debugger/engine";
import {
  buildRuleView,
  evaluationErrorsNote,
  hiddenRulesNote,
  missingInputsNote,
  ruleFilterNote,
  ruleFilterPayload,
} from "./rule-view";

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
    evaluationErrors: { rules: 0, selectors: [], messages: [], sampleRuleIndexes: [] },
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
  test("the attribution and the per-rule origin come back unasked", () => {
    const view = buildRuleView(sim([rule(0, "matched"), rule(1, "no-match")]), ATTRIBUTED, {
      verdict: "all",
      // No `--source`: the attribution is not the filter's private business.
      source: "all",
      transport: "cli",
    });
    expect(view.attribution ?? []).not.toHaveLength(0);
    expect(view.originOf(1)).toEqual({ layer: "repo", sourceIndex: 1 });
  });

  test("an unattributable run carries no attribution, and links nothing", () => {
    const view = buildRuleView(sim([rule(0, "matched")]), UNATTRIBUTABLE, {
      verdict: "all",
      source: "all",
      transport: "cli",
    });
    expect(view.attribution ?? []).toHaveLength(0);
    expect(view.originOf(0)).toBeUndefined();
    // …and the existing behavior is untouched: nothing was filtered, so
    // nothing is reported.
    expect(view.notes).toEqual([]);
  });

  test("the verdict facet counts what it hid", () => {
    const view = buildRuleView(sim([rule(0, "matched"), rule(1, "no-match")]), UNATTRIBUTABLE, {
      verdict: "matched",
      source: "all",
      transport: "cli",
    });
    expect(view.rules).toHaveLength(1);
    expect(view.total).toBe(2);
    expect(view.hidden).toBe(1);
    expect(view.notes).toEqual([]);
  });
});

/** The noun agrees with the TOTAL, like the engine's sibling notes stacked
 *  beneath it — "1 of 2 rules hidden" over "1 of 2 rules could not match". */
describe("hiddenRulesNote", () => {
  test("one hidden row out of two still reads `rules`", () => {
    const view = buildRuleView(sim([rule(0, "matched"), rule(1, "no-match")]), ATTRIBUTED, {
      verdict: "matched",
      source: "all",
      transport: "cli",
    });
    expect(hiddenRulesNote(view)).toContain("1 of 2 rules hidden");
  });

  test("nothing hidden means no line at all", () => {
    const view = buildRuleView(sim([rule(0, "matched")]), ATTRIBUTED, {
      verdict: "all",
      source: "all",
      transport: "cli",
    });
    expect(hiddenRulesNote(view)).toBeUndefined();
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

/**
 * Roadmap 073. The default is now `notable` on every surface, which is only
 * safe while the answer states what it withheld and names the parameter that
 * returns it — the reversibility invariant. `ruleFilter` carries the counts,
 * `ruleFilterNote` the reversals, in the caller's own spelling.
 */
describe("the flipped default states what it withheld", () => {
  const RULES = [rule(0, "matched"), rule(1, "no-match"), rule(2, "no-match")];

  const viewAt = (verdict: "notable" | "all", transport: "cli" | "mcp") =>
    buildRuleView(sim(RULES), ATTRIBUTED, { verdict, source: "all", transport });

  test("the counts are on every payload, filtered or not", () => {
    expect(ruleFilterPayload(viewAt("notable", "mcp")).ruleFilter).toEqual({
      verdict: "notable",
      source: "all",
      total: 3,
      shown: 1,
      hidden: 2,
    });
    expect(ruleFilterPayload(viewAt("all", "mcp")).ruleFilter).toMatchObject({
      total: 3,
      shown: 3,
      hidden: 0,
    });
  });

  test("the note names the count and the exact reversals, per transport", () => {
    const mcp = ruleFilterNote(viewAt("notable", "mcp")) ?? "";
    expect(mcp).toContain("1 of 3 rules");
    expect(mcp).toContain("2 withheld");
    expect(mcp).toContain('`verdict: "all"` returns every row');
    expect(mcp).toContain("`rule: N`");
    expect(mcp).not.toContain("--verdict");

    const cli = ruleFilterNote(viewAt("notable", "cli")) ?? "";
    expect(cli).toContain("`--verdict all` returns every row");
    expect(cli).toContain("`--rule N`");
    expect(cli).not.toContain('verdict: "all"');
  });

  test("an unnarrowed view has nothing to point at", () => {
    expect(ruleFilterNote(viewAt("all", "cli"))).toBeUndefined();
  });
});

/** The drill-down that makes `missingInputs.sampleRuleIndexes` actionable. */
describe("buildRuleView with a single rule", () => {
  const RULES = [rule(0, "matched"), rule(1, "no-match")];

  test("returns that row whatever the facets would hide, and says the facets did not decide", () => {
    const view = buildRuleView(sim(RULES), ATTRIBUTED, {
      // `notable` hides rule 1; the drill-down is about rule 1.
      verdict: "notable",
      source: "presets",
      rule: 1,
      transport: "mcp",
    });
    expect(view.rules.map((r) => r.index)).toEqual([1]);
    expect(view.rule).toBe(1);
    // The facets report `all`, because none of them produced this list.
    expect(view.verdict).toBe("all");
    expect(view.source).toBe("all");
    expect(view.total).toBe(2);
    expect(view.hidden).toBe(1);
    expect(ruleFilterPayload(view).ruleFilter).toMatchObject({ rule: 1, shown: 1, hidden: 1 });
    expect(ruleFilterNote(view)).toContain("ONLY merged rule 1");
  });

  test("an index the run does not have names the total", () => {
    expect(() =>
      buildRuleView(sim(RULES), ATTRIBUTED, {
        verdict: "notable",
        source: "all",
        rule: 7,
        transport: "cli",
      }),
    ).toThrow(/evaluated 2 merged packageRules; there is no rule 7/);
  });
});

/** The engine owns the sentence; this layer owns the pointer at its end — and
 *  "the tool could not evaluate this rule" is the last thing that may go
 *  missing, so it gets the same treatment as the missing-input one. */
describe("evaluationErrorsNote", () => {
  const SUMMARY = {
    rules: 1,
    selectors: ["matchCurrentVersion"],
    messages: ["matcher threw: conda versioning is not supported"],
    sampleRuleIndexes: [0],
    note: "1 of 4 rules could not be EVALUATED: `matchCurrentVersion` threw.",
  };

  test("each transport is told the spelling it can use", () => {
    expect(evaluationErrorsNote(SUMMARY, "cli")).toBe(
      `${SUMMARY.note} \`--verdict error\` lists them.`,
    );
    expect(evaluationErrorsNote(SUMMARY, "mcp")).toBe(
      `${SUMMARY.note} \`verdict: "error"\` lists them.`,
    );
  });

  test("nothing to say means no line at all", () => {
    expect(
      evaluationErrorsNote({ rules: 0, selectors: [], messages: [], sampleRuleIndexes: [] }, "cli"),
    ).toBeUndefined();
  });
});
