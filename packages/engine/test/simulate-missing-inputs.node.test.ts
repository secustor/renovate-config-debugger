/**
 * Unit tests for the pure missing-input reduction. Builds `RuleEvaluation`
 * fixtures by hand (the module reads verdicts and clauses only), so this needs
 * no Renovate machinery and runs as a plain node test — the golden↔shimmed
 * integration case in simulate-package-rules.*.test.ts owns the question of
 * whether a real run produces these shapes.
 */
import { describe, expect, it } from "vitest";
import { isNoInputNoMatch, type RuleEvaluation, summarizeMissingInputs } from "../src/index";

type ClauseSpec = [
  key: string,
  state: RuleEvaluation["clauses"][number]["state"],
  ...fields: string[],
];

function rule(
  index: number,
  verdict: RuleEvaluation["verdict"],
  clauses: ClauseSpec[],
): RuleEvaluation {
  return {
    index,
    verdict,
    clauses: clauses.map(([key, state, ...readFields]) => ({
      key,
      value: ["x"],
      state,
      inputValues: {},
      readFields,
    })),
    notes: [],
  };
}

/** The commonest shape: one clause that fail-closed on an unset field. */
function noInput(index: number, key: string, ...fields: string[]): RuleEvaluation {
  return rule(index, "no-match", [[key, "no-input", ...fields]]);
}

describe("summarizeMissingInputs", () => {
  it("groups by the fields the clause read, and counts distinct rules", () => {
    const summary = summarizeMissingInputs([
      noInput(0, "matchSourceUrls", "sourceUrl"),
      noInput(1, "matchFileNames", "packageFile", "lockFiles"),
      noInput(2, "matchSourceUrls", "sourceUrl"),
    ]);
    expect(summary.rules).toBe(3);
    expect(summary.groups).toEqual([
      {
        fields: ["sourceUrl"],
        fieldList: "sourceUrl",
        selectors: ["matchSourceUrls"],
        rules: 2,
        sampleRuleIndexes: [0, 2],
      },
      {
        fields: ["packageFile", "lockFiles"],
        fieldList: "packageFile or lockFiles",
        selectors: ["matchFileNames"],
        rules: 1,
        sampleRuleIndexes: [1],
      },
    ]);
  });

  it("samples at most five rule indexes, ascending", () => {
    const summary = summarizeMissingInputs(
      [9, 3, 1, 7, 5, 2, 8].map((index) => noInput(index, "matchSourceUrls", "sourceUrl")),
    );
    expect(summary.rules).toBe(7);
    expect(summary.groups[0]?.rules).toBe(7);
    expect(summary.groups[0]?.sampleRuleIndexes).toEqual([1, 2, 3, 5, 7]);
  });

  it("dedupes and sorts the selectors that read the same field set", () => {
    const summary = summarizeMissingInputs([
      noInput(0, "matchSourceUrls", "sourceUrl"),
      noInput(1, "excludeSourceUrls", "sourceUrl"),
      noInput(2, "matchSourceUrls", "sourceUrl"),
    ]);
    expect(summary.groups[0]?.selectors).toEqual(["excludeSourceUrls", "matchSourceUrls"]);
  });

  /**
   * The parity property that makes the number citable: it is the number of
   * rules the `no-input` verdict facet prints. A rule that ALSO mismatched on
   * real data would not start matching if you set the field.
   */
  it("excludes a rule that also lost on a genuine mismatch", () => {
    const mixed = rule(0, "no-match", [
      ["matchDepTypes", "no-match", "depType", "depTypes"],
      ["matchSourceUrls", "no-input", "sourceUrl"],
    ]);
    expect(isNoInputNoMatch(mixed)).toBe(false);
    expect(summarizeMissingInputs([mixed])).toEqual({ rules: 0, groups: [] });
  });

  it("ignores matched, not-simulated, clause-less and error-failed rules", () => {
    const summary = summarizeMissingInputs([
      rule(0, "matched", [["matchPackageNames", "matched", "packageName"]]),
      rule(1, "not-simulated", [["matchConfidence", "not-simulated", "mergeConfidenceLevel"]]),
      rule(2, "no-match", []),
      // An `error` clause fails the rule too, so the rule did not lose SOLELY
      // to unset input — setting the field would not decide it.
      rule(3, "no-match", [
        ["matchCurrentVersion", "error", "currentValue"],
        ["matchSourceUrls", "no-input", "sourceUrl"],
      ]),
      // Neutral clauses decide nothing and must not qualify a rule on their own.
      rule(4, "no-match", [
        ["matchCurrentAge", "not-applicable", "currentVersionTimestamp"],
        ["matchSourceUrls", "no-input", "sourceUrl"],
      ]),
    ]);
    expect(summary.rules).toBe(1);
    expect(summary.groups[0]?.sampleRuleIndexes).toEqual([4]);
  });

  it("says nothing at all when nothing failed on unset input", () => {
    expect(summarizeMissingInputs([])).toEqual({ rules: 0, groups: [] });
    const matched = summarizeMissingInputs([
      rule(0, "matched", [["matchPackageNames", "matched", "packageName"]]),
    ]);
    expect(matched).toEqual({ rules: 0, groups: [] });
    expect(matched.note).toBeUndefined();
  });

  it("names the one field in a single-group note", () => {
    const rules = [
      noInput(0, "matchSourceUrls", "sourceUrl"),
      rule(1, "matched", [["matchPackageNames", "matched", "packageName"]]),
    ];
    expect(summarizeMissingInputs(rules).note).toBe(
      "1 of 2 rules could not match because the simulated dependency has no sourceUrl — " +
        "Renovate treats a missing value as a non-match. Set sourceUrl on the dependency if " +
        "you expected these rules to fire.",
    );
  });

  it("lists the fields, biggest first, in a multi-group note", () => {
    const summary = summarizeMissingInputs([
      noInput(0, "matchSourceUrls", "sourceUrl"),
      noInput(1, "matchSourceUrls", "sourceUrl"),
      noInput(2, "matchDepTypes", "depType", "depTypes"),
      noInput(3, "matchCategories", "categories"),
    ]);
    expect(summary.rules).toBe(4);
    expect(summary.note).toBe(
      "4 of 4 rules could not match because the simulated dependency leaves fields they read " +
        "unset: sourceUrl (2 rules), categories (1 rule), depType or depTypes (1 rule) — " +
        "Renovate treats a missing value as a non-match. Set them on the dependency if you " +
        "expected these rules to fire.",
    );
  });

  it("names three field sets and counts the rest", () => {
    const summary = summarizeMissingInputs([
      noInput(0, "matchSourceUrls", "sourceUrl"),
      noInput(1, "matchCategories", "categories"),
      noInput(2, "matchDepTypes", "depType", "depTypes"),
      noInput(3, "matchBaseBranches", "baseBranch"),
      noInput(4, "matchRepositories", "repository"),
    ]);
    // Every group holds one rule, so the tie breaks on `fieldList` ascending.
    expect(summary.groups.map((group) => group.fieldList)).toEqual([
      "baseBranch",
      "categories",
      "depType or depTypes",
      "repository",
      "sourceUrl",
    ]);
    expect(summary.note).toContain(
      "baseBranch (1 rule), categories (1 rule), depType or depTypes (1 rule), and 2 more fields —",
    );
  });

  /** One rule, two unset fields: each group answers "what would setting THIS
   *  field buy me", so the rule is in both — and counted once. */
  it("puts a rule with two no-input clauses in two groups, counted once", () => {
    const summary = summarizeMissingInputs([
      rule(0, "no-match", [
        ["matchCategories", "no-input", "categories"],
        ["matchSourceUrls", "no-input", "sourceUrl"],
      ]),
    ]);
    expect(summary.rules).toBe(1);
    expect(summary.groups.map((group) => group.fieldList)).toEqual(["categories", "sourceUrl"]);
    expect(summary.note).toContain("1 of 1 rule could not match");
  });
});
