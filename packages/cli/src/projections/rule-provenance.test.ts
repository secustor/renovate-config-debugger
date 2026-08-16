import { describe, expect, test } from "vitest";
import type { KeyProvenance, RuleAttribution } from "@renovate-config-debugger/engine";
import {
  oneRuleView,
  RULE_DIGEST_PLANS,
  ruleOrigin,
  ruleProvenanceView,
  ruleSourceRanges,
} from "./rule-provenance";

/**
 * Roadmap 071. No engine run here on purpose: what this module owns is the
 * compression of a complete per-rule attribution into ranges, and the digest
 * lines that degrade under a byte budget while the ranges never do. The
 * attribution itself is the engine's, covered by its own suites.
 */

const PRESET_A = { kind: "preset", nodeId: "n1", name: "config:recommended" } as const;
const PRESET_B = { kind: "preset", nodeId: "n2", name: "config:recommended" } as const;

function attr(
  index: number,
  layer: RuleAttribution["layer"],
  sourceIndex: number,
): RuleAttribution {
  return { index, layer, sourceIndex };
}

/** One preset, the SAME preset a second time, then two repo-authored rules. */
const ATTRIBUTION: RuleAttribution[] = [
  attr(0, PRESET_A, 0),
  attr(1, PRESET_A, 1),
  attr(2, PRESET_B, 0),
  attr(3, { kind: "repo" }, 0),
  attr(4, { kind: "repo" }, 1),
];

const RULES: unknown[] = [
  { matchPackageNames: ["react"], groupName: "react" },
  { matchDepTypes: ["devDependencies"], matchUpdateTypes: ["major"], automerge: true },
  { matchManagers: ["npm"], description: "prose", labels: ["npm"] },
  { matchSourceUrls: ["https://github.com/facebook/react"], minimumReleaseAge: "7 days" },
  { description: "no selectors at all" },
];

const ENTRY: KeyProvenance = {
  key: "packageRules",
  finalValue: RULES,
  isDefaultOnly: false,
  chain: [
    { layer: PRESET_A, action: "set", before: undefined, after: RULES.slice(0, 2) },
    { layer: PRESET_B, action: "concat", before: RULES.slice(0, 2), after: RULES.slice(0, 3) },
    { layer: { kind: "repo" }, action: "concat", before: RULES.slice(0, 3), after: RULES },
  ],
};

const [RICHEST, SHAPED, COUNTED] = RULE_DIGEST_PLANS;

describe("ruleSourceRanges", () => {
  test("one contiguous range per contributing layer", () => {
    expect(ruleSourceRanges(ATTRIBUTION)).toEqual([
      {
        layer: "preset config:recommended",
        kind: "preset",
        node: "config:recommended",
        from: 0,
        to: 1,
        count: 2,
      },
      {
        layer: "preset config:recommended",
        kind: "preset",
        node: "config:recommended",
        from: 2,
        to: 2,
        count: 1,
      },
      { layer: "repo", kind: "repo", from: 3, to: 4, count: 2 },
    ]);
  });

  test("the same preset extended twice stays two ranges", () => {
    // Keyed on the NODE, not the name: merging them would invent a contiguity
    // the merge does not have, and `index - from` would then be wrong for the
    // second block.
    const ranges = ruleSourceRanges(ATTRIBUTION).filter((r) => r.kind === "preset");
    expect(ranges).toHaveLength(2);
  });

  test("no attribution is no ranges, not an empty guess", () => {
    expect(ruleSourceRanges(undefined)).toEqual([]);
  });
});

describe("ruleOrigin", () => {
  test("a merged index maps to its layer and its index inside that layer", () => {
    expect(ruleOrigin(4, ATTRIBUTION)).toEqual({ layer: "repo", sourceIndex: 1 });
    expect(ruleOrigin(2, ATTRIBUTION)).toEqual({
      layer: "preset config:recommended",
      sourceIndex: 0,
    });
  });

  test("an unattributable run links nothing", () => {
    expect(ruleOrigin(0, undefined)).toBeUndefined();
    expect(ruleOrigin(99, ATTRIBUTION)).toBeUndefined();
  });
});

describe("ruleProvenanceView", () => {
  test("the ranges cover every merged rule, and say the key concatenates", () => {
    const view = ruleProvenanceView(ENTRY, ATTRIBUTION, RULES, RICHEST);
    expect(view.mergeSemantics).toBe("concat");
    expect(view.total).toBe(5);
    expect(view.badge).toBe("appended");
    const counted = (view.contributions ?? []).reduce((sum, c) => sum + c.count, 0);
    expect(counted).toBe(view.total);
    expect(view.note).toContain("rule:");
    expect(view.note).toContain("get_final_config");
    expect(view.attributionNote).toBeUndefined();
  });

  test("`values` prefixes each line with the MERGED index and previews the first selector", () => {
    const view = ruleProvenanceView(ENTRY, ATTRIBUTION, RULES, RICHEST);
    const repo = view.contributions?.find((c) => c.kind === "repo");
    expect(repo?.rules?.[0]).toBe(
      '3 matchSourceUrls: ["https://github.com/facebook/react"] → minimumReleaseAge',
    );
    // A rule with no selectors says so rather than reading as an empty one.
    expect(repo?.rules?.[1]).toBe("4 (no match*/exclude* selectors) → (sets nothing)");
    const preset = view.contributions?.[0];
    expect(preset?.rules?.[1]).toContain("+1 → automerge");
  });

  test("`shape` drops the values but keeps every line, `counts` drops the lines", () => {
    const shaped = ruleProvenanceView(ENTRY, ATTRIBUTION, RULES, SHAPED);
    expect(shaped.contributions?.[0]?.rules?.[1]).toBe(
      "1 matchDepTypes + matchUpdateTypes → automerge",
    );
    // The authored layers keep their values at every level — they are a
    // handful of rules at any scale, and they are the ones the reader wrote.
    expect(shaped.contributions?.at(-1)?.rules?.[0]).toContain('matchSourceUrls: ["https');
    expect(shaped.detailNote).toContain("size budget");

    const counted = ruleProvenanceView(ENTRY, ATTRIBUTION, RULES, COUNTED);
    expect(counted.contributions?.[0]?.rules).toBeUndefined();
    expect(counted.contributions?.[0]?.count).toBe(2);
    expect(counted.contributions?.at(-1)?.rules).toHaveLength(2);
  });

  test("`source` scopes the ranges without moving the indexes", () => {
    const view = ruleProvenanceView(ENTRY, ATTRIBUTION, RULES, RICHEST, { source: "repo" });
    expect(view.source).toBe("repo");
    expect(view.contributions).toHaveLength(1);
    expect(view.contributions?.[0]).toMatchObject({ layer: "repo", from: 3, to: 4 });
    // `total` still counts every merged rule: a scoped view is a smaller
    // answer to the same question, not a different array.
    expect(view.total).toBe(5);
  });

  test("an unattributable run reports nothing rather than a wrong link", () => {
    const view = ruleProvenanceView(ENTRY, undefined, RULES, RICHEST);
    expect(view.contributions).toBeUndefined();
    expect(view.attributionNote).toContain("could not be attributed");
    expect(view.total).toBe(5);
  });
});

describe("oneRuleView", () => {
  test("one rule's body, with the citation in both index schemes", () => {
    const one = oneRuleView(3, ATTRIBUTION, RULES);
    expect(one).toMatchObject({ index: 3, layer: "repo", sourceIndex: 0 });
    expect(one.citation).toContain("merged packageRules[3]");
    expect(one.citation).toContain("packageRules[0]");
    expect(one.rule).toBe(RULES[3]);
  });

  test("a preset rule cites the preset it came from", () => {
    expect(oneRuleView(2, ATTRIBUTION, RULES).citation).toContain("preset config:recommended");
  });

  test("an index past the end is an error naming the count", () => {
    expect(() => oneRuleView(9, ATTRIBUTION, RULES)).toThrow(/5 merged packageRules/);
  });

  test("without attribution the body is still returned, the layer is not guessed", () => {
    const one = oneRuleView(3, undefined, RULES);
    expect(one.layer).toBeNull();
    expect(one.sourceIndex).toBeNull();
    expect(one.rule).toBe(RULES[3]);
  });
});
