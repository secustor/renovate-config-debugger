import { describe, expect, test } from "vitest";
import type { RuleAttribution } from "@renovate-config-debugger/engine";
import { crossRuleIndex, ruleIndexInMessage } from "./rule-cross-index";

/**
 * Roadmap 071: the cases `RuleMessage` used to own inline, now that both the
 * app and `rcd validate`/MCP quote this mapping.
 */

/** A preset rule first, then two the repo authored — the `mixed-rules` shape. */
const ATTRIBUTION: RuleAttribution[] = [
  {
    index: 0,
    layer: { kind: "preset", nodeId: "n1", name: ":disablePeerDependencies" },
    sourceIndex: 0,
  },
  { index: 1, layer: { kind: "repo" }, sourceIndex: 0 },
  { index: 2, layer: { kind: "repo" }, sourceIndex: 1 },
];

describe("ruleIndexInMessage", () => {
  test("finds the reference and where it sits in the prose", () => {
    const found = ruleIndexInMessage(
      "packageRules[1].matchPackageNames: Your input contains * but it is not the only element",
    );
    expect(found).toMatchObject({ index: 1, text: "packageRules[1]", start: 0 });
    expect(found?.end).toBe("packageRules[1]".length);
  });

  test("a nested reference resolves to the TOP-LEVEL index", () => {
    // `exec`'s first match wins, which is the index both schemes are defined
    // against — a nested rule has no index of its own in either array.
    expect(ruleIndexInMessage("packageRules[0].packageRules[2]: invalid")?.index).toBe(0);
  });

  test("a message with no rule reference matches nothing", () => {
    expect(ruleIndexInMessage("Invalid configuration option: foo")).toBeUndefined();
  });
});

describe("crossRuleIndex", () => {
  test("a repo-config index maps to its merged index", () => {
    expect(crossRuleIndex("repo", 1, ATTRIBUTION)).toBe(2);
  });

  test("a merged index maps back to the repo-config index", () => {
    expect(crossRuleIndex("merged", 2, ATTRIBUTION)).toBe(1);
  });

  test("a preset-sourced merged rule has no repo index to annotate with", () => {
    expect(crossRuleIndex("merged", 0, ATTRIBUTION)).toBeUndefined();
  });

  test("no attribution links nothing — a wrong link is worse than none", () => {
    expect(crossRuleIndex("repo", 0, undefined)).toBeUndefined();
    expect(crossRuleIndex("merged", 0, null)).toBeUndefined();
  });

  test("an index no layer claims is left unannotated", () => {
    expect(crossRuleIndex("repo", 9, ATTRIBUTION)).toBeUndefined();
    expect(crossRuleIndex("merged", 9, ATTRIBUTION)).toBeUndefined();
  });
});
