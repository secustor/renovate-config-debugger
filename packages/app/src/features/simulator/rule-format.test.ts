/**
 * Replay-02 R3/R4: the collapsed rule label and the verdict badge are what
 * survive a screenshot, and both used to render a fail-closed missing-input
 * rule identically to a genuine data mismatch. Locks the three distinctions —
 * label suffix, badge text, clause glyph — with two different fields, so the
 * fix stays field-agnostic rather than sourceUrl-specific.
 */
import type { ClauseEvaluation, RuleEvaluation } from "@renovate-config-debugger/engine";
import { describe, expect, test } from "vitest";
import { clauseEval, ruleEval } from "@tools/test/simulation";
import { clauseIcon, ruleLabel, ruleVerdictLabel } from "./rule-format";

function clause(
  key: string,
  state: ClauseEvaluation["state"],
  readFields: string[],
): ClauseEvaluation {
  return clauseEval(state, { key, readFields });
}

/** The label is a property of the CLAUSES, so they lead here; the index never
 *  reaches the string under test. */
function rule(clauses: ClauseEvaluation[], verdict: RuleEvaluation["verdict"]): RuleEvaluation {
  return ruleEval(0, verdict, clauses);
}

describe("ruleLabel", () => {
  test("a fail-closed deciding clause names the unset field, whatever it is", () => {
    expect(
      ruleLabel(rule([clause("matchSourceUrls", "no-input", ["sourceUrl"])], "no-match")),
    ).toBe("matchSourceUrls — failed on matchSourceUrls (sourceUrl not set in this simulation)");
    // A matcher reading several fields names them all.
    expect(
      ruleLabel(rule([clause("matchDepTypes", "no-input", ["depType", "depTypes"])], "no-match")),
    ).toBe("matchDepTypes — failed on matchDepTypes (depType/depTypes not set in this simulation)");
  });

  test("a genuine mismatch keeps the plain failed-on suffix", () => {
    expect(
      ruleLabel(rule([clause("matchPackageNames", "no-match", ["packageName"])], "no-match")),
    ).toBe("matchPackageNames — failed on matchPackageNames");
  });

  test("an all-matched rule is just the joined clause list", () => {
    expect(
      ruleLabel(rule([clause("matchDatasources", "matched", ["datasource"])], "matched")),
    ).toBe("matchDatasources");
  });
});

describe("ruleVerdictLabel", () => {
  test("no-match decided solely by missing input says so", () => {
    expect(
      ruleVerdictLabel(rule([clause("matchCategories", "no-input", ["categories"])], "no-match")),
    ).toBe("no match — input not set");
  });

  test("a real mismatch anywhere keeps the plain badge", () => {
    expect(
      ruleVerdictLabel(
        rule(
          [
            clause("matchSourceUrls", "no-input", ["sourceUrl"]),
            clause("matchPackageNames", "no-match", ["packageName"]),
          ],
          "no-match",
        ),
      ),
    ).toBe("no match");
    expect(ruleVerdictLabel(rule([], "matched"))).toBe("matched");
  });
});

describe("clauseIcon", () => {
  test("fail-closed, mismatch, and never-evaluated all render distinctly", () => {
    expect(clauseIcon("no-input")).toBe("⚠");
    expect(clauseIcon("not-applicable")).toBe("∅");
    expect(clauseIcon("not-simulated")).toBe("∅");
    expect(clauseIcon("no-match")).toBe("✗");
    expect(clauseIcon("matched")).toBe("✓");
    expect(clauseIcon("no-match")).not.toBe(clauseIcon("no-input"));
    expect(clauseIcon("no-input")).not.toBe(clauseIcon("not-applicable"));
  });
});
