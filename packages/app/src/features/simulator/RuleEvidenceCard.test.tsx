import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuleEvidence } from "./rule-evidence";
import { RuleEvidenceAnchor } from "./RuleEvidenceCard";

/**
 * Roadmap 054 layer 3 — the popover's interaction contract, the part that is
 * not the derivation: it opens from the rule reference, it light-dismisses
 * (Escape, click outside), and dismissing hands focus BACK to the reference
 * rather than dropping it on <body>. The e2e suite (layer 5) drives the same
 * flow against the production build; this is the fast guard.
 */

const EVIDENCE: RuleEvidence = {
  ruleIndex: 201,
  verdict: "matched",
  clauses: [],
  stopIndex: 2,
  stopOrdinal: 2,
  stopLabel: "step 2 of 3",
  writes: [
    {
      key: "schedule",
      before: ["at any time"],
      hadBefore: true,
      after: ["before 6am"],
      hadAfter: true,
      survived: true,
    },
    {
      key: "groupName",
      before: undefined,
      hadBefore: false,
      after: "npm minor+patch",
      hadAfter: true,
      survived: false,
      overriddenAtStopIndex: 3,
      overriddenAtOrdinal: 3,
      overriddenAtLabel: "step 3 of 3",
    },
  ],
  survivedCount: 1,
};

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

function open(onOpenRule?: (ruleIndex: number) => void) {
  const view = render(
    <RuleEvidenceAnchor ruleIndex={201} evidenceFor={() => EVIDENCE} onOpenRule={onOpenRule} />,
  );
  const anchor = view.getByRole("button", { name: "packageRules[201]" });
  act(() => {
    fireEvent.click(anchor);
  });
  return { view, anchor };
}

describe("RuleEvidenceCard", () => {
  it("opens from the rule reference and digests the rule's writes", () => {
    const { view } = open();
    const dialog = view.getByRole("dialog", { name: "packageRules[201] — rule evidence" });
    expect(dialog.textContent).toContain("merged in step 2 of 3 — 2 writes, 1 survived");
    // The lost write names the stop that took it; the surviving one does not.
    expect(dialog.textContent).toContain("⊘ overridden in step 3 of 3");
    expect(dialog.querySelectorAll(".sim-merged-after.overridden")).toHaveLength(1);
  });

  // Layer 7 — the two affordances the popover lost by not being the matched-
  // rules drawer: every written key is an option-docs hook, and the digest is
  // exportable as markdown like the drawer's applied diff always was.
  it("gives every written key the option-docs hook and offers the markdown export", () => {
    const { view } = open();
    const dialog = view.getByRole("dialog", { name: "packageRules[201] — rule evidence" });
    expect(dialog.querySelectorAll(".sim-write-key .opt-key")).toHaveLength(2);
    expect(view.getByRole("button", { name: "Copy as markdown" })).toBeTruthy();
  });

  it("closes on Escape and gives focus back to the anchor", () => {
    const { view, anchor } = open();
    expect(document.activeElement?.getAttribute("role")).toBe("dialog");
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(view.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(anchor);
    expect(anchor.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on a click outside", () => {
    const { view } = open();
    act(() => {
      fireEvent.mouseDown(document.body);
    });
    expect(view.queryByRole("dialog")).toBeNull();
  });

  it("stays open while the card itself is clicked", () => {
    const { view } = open();
    act(() => {
      fireEvent.mouseDown(view.getByRole("dialog"));
    });
    expect(view.queryByRole("dialog")).not.toBeNull();
  });

  it("hands the rule to the matched-rules jump and closes", () => {
    const onOpenRule = vi.fn();
    const { view } = open(onOpenRule);
    act(() => {
      fireEvent.click(view.getByRole("button", { name: "open in matched rules →" }));
    });
    expect(onOpenRule).toHaveBeenCalledWith(201);
    expect(view.queryByRole("dialog")).toBeNull();
  });
});
