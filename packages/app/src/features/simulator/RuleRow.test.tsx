import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RuleEvaluation } from "@renovate-config-debugger/engine";
import type { RuleDescriptionNote } from "./rule-descriptions";
import { RuleRow } from "./RuleRow";

/**
 * Roadmap 069 (PR 5): the matched-rules drawer's half of "the rule explains why
 * it exists". The wording is unit tested (`rule-descriptions.test.ts`); what a
 * row decides is WHERE the quote goes and WHETHER it appears at all — outside
 * the head button (prose in a button is neither selectable nor announced as
 * prose) and only on a row that matched.
 */

const NOTE: RuleDescriptionNote = {
  ruleIndex: 3,
  values: ["Pin Docker digests."],
  attribution: "author's description of this rule",
};

function rule(verdict: RuleEvaluation["verdict"]): RuleEvaluation {
  return { index: 3, verdict, clauses: [], notes: [] };
}

describe("RuleRow", () => {
  it("quotes a matched rule's description outside the collapsed head", () => {
    const view = render(<RuleRow rule={rule("matched")} description={NOTE} />);
    const quote = view.container.querySelector(".sim-rule-why");
    expect(quote?.textContent).toContain("Pin Docker digests.");
    expect(quote?.textContent).toContain("— author's description of this rule");
    // Visible with the row still collapsed, and not inside its toggle.
    expect(view.container.querySelector(".sim-rule-detail")).toBeNull();
    expect(view.container.querySelector(".sim-rule-head .sim-rule-why")).toBeNull();
  });

  it("says nothing on a row that did not match, described or not", () => {
    const view = render(<RuleRow rule={rule("no-match")} description={NOTE} />);
    expect(view.container.querySelector(".sim-rule-why")).toBeNull();
  });

  it("adds no quote chrome to an undescribed rule", () => {
    const view = render(<RuleRow rule={rule("matched")} />);
    expect(view.container.querySelector(".sim-rule-why")).toBeNull();
  });
});
