import { describe, expect, test } from "vitest";
import type {
  DescriptionProvenance,
  ProvenanceLayer,
  RuleDescriptionAttribution,
} from "@renovate-config-debugger/engine";
import { buildRuleDescriptions, ruleDescriptionAttribution } from "./rule-descriptions";

/**
 * Roadmap 069 (PR 5): the wording of the quote's attribution line, and the
 * index it is built from. The engine (PR 1) proves that a described rule is
 * attributed to the right LAYER; what matters here is that the line says the
 * right thing about each of them — above all that the reader's own rule is
 * cited by the index it has in THEIR config, not by the merged index.
 */

const PRESET: ProvenanceLayer = {
  kind: "preset",
  nodeId: "p2",
  name: "security:minimumReleaseAgeNpm",
};
const REPO: ProvenanceLayer = { kind: "repo" };

function attribution(parts: Partial<RuleDescriptionAttribution>): RuleDescriptionAttribution {
  return { ruleIndex: 0, sourceIndex: 0, layer: PRESET, values: ["Because."], ...parts };
}

function provenance(ruleDescriptions: RuleDescriptionAttribution[]): DescriptionProvenance {
  return {
    entries: [],
    unattributed: [],
    finalLength: 0,
    dropped: [],
    ruleDescriptions,
    degraded: false,
  };
}

describe("ruleDescriptionAttribution", () => {
  test("a preset rule's line names no one — the row's chip already does", () => {
    expect(ruleDescriptionAttribution(attribution({}))).toBe("author's description of this rule");
  });

  test("the reader's own rule is cited by its index in their config", () => {
    // `packageRules[312]` is the merged index the row prints; `packageRules[0]`
    // is the one they can find in the editor, and that is the citation.
    expect(
      ruleDescriptionAttribution(attribution({ ruleIndex: 312, sourceIndex: 0, layer: REPO })),
    ).toBe("your description, packageRules[0] in your repo config");
  });

  test("a layer with no author names the level instead", () => {
    expect(ruleDescriptionAttribution(attribution({ layer: { kind: "inherited" } }))).toBe(
      "description from the inherited config",
    );
  });
});

describe("buildRuleDescriptions", () => {
  test("indexes by the MERGED rule index — the id every simulator row carries", () => {
    const byIndex = buildRuleDescriptions(
      provenance([
        attribution({
          ruleIndex: 312,
          sourceIndex: 4,
          values: ["accounts monorepo", "Group packages from accounts monorepo together."],
        }),
      ]),
    );

    expect([...byIndex.keys()]).toEqual([312]);
    // Both strings survive as separate lines: they are separate sentences, not
    // one sentence split, and the quote renders one per line.
    expect(byIndex.get(312)?.values).toEqual([
      "accounts monorepo",
      "Group packages from accounts monorepo together.",
    ]);
    expect(byIndex.get(312)?.attribution).toBe("author's description of this rule");
  });

  test("is empty when the run has no attribution at all", () => {
    expect(buildRuleDescriptions(null).size).toBe(0);
    expect(buildRuleDescriptions(undefined).size).toBe(0);
  });

  test("skips an entry with no strings — no empty quote chrome", () => {
    expect(buildRuleDescriptions(provenance([attribution({ values: [] })])).size).toBe(0);
  });
});
