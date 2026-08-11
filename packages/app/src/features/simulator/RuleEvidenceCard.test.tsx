import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { claimModalKeyboard, overlayKeyboardOwned } from "@/lib/escape-stack";
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

/** The card's anchor as it really sits: inside a results panel that a tab
 *  switch hides in place, rather than unmounting (`ResultsPanel`). */
function Panel({ hidden }: { hidden: boolean }) {
  return (
    <div hidden={hidden}>
      <RuleEvidenceAnchor ruleIndex={201} evidenceFor={() => EVIDENCE} />
    </div>
  );
}

/** …under the strip that hid it, whose selected tab is where focus goes when
 *  the anchor can no longer take it back. */
function TabbedPanel({ hidden }: { hidden: boolean }) {
  return (
    <>
      <div role="tablist" aria-label="Results">
        <button type="button" role="tab" aria-selected="true">
          Presets
        </button>
      </div>
      <Panel hidden={hidden} />
    </>
  );
}

/** Two references in one thread — the state only a keyboard could reach. */
function TwoAnchors() {
  return (
    <>
      <RuleEvidenceAnchor ruleIndex={201} evidenceFor={() => EVIDENCE} />
      <RuleEvidenceAnchor ruleIndex={202} evidenceFor={() => ({ ...EVIDENCE, ruleIndex: 202 })} />
    </>
  );
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

  it("survives a press that belongs to a modal — the ? sheet opened over it", () => {
    // Roadmap 067 review: `?` is the one binding that fires under an overlay,
    // so the sheet can be opened with this card standing. Dismissing the sheet
    // presses its backdrop, and that press reaches this document listener on
    // its way past — `inert` covers the page, not the listener above it.
    const { view } = open();
    const release = claimModalKeyboard();
    act(() => {
      fireEvent.mouseDown(document.body);
    });
    expect(view.queryByRole("dialog")).not.toBeNull();

    // …and the card is dismissable again the moment the sheet lets go.
    release();
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

  it("closes with the results panel its anchor lives in, releasing the keyboard", async () => {
    // Roadmap 067 review: a tab switch neither unmounts this anchor nor fires a
    // pointer press, and the card is portalled to `<body>`, so the panel's
    // `hidden` does not cover it. Left open it floated over an unrelated panel
    // and kept `overlayKeyboardOwned()` true INDEFINITELY — every bare key
    // (`e`, `r`, `1`–`7`) and Home/End page scroll dead, with no visible cause.
    const view = render(<Panel hidden={false} />);
    act(() => {
      fireEvent.click(view.getByRole("button", { name: "packageRules[201]" }));
    });
    expect(view.queryByRole("dialog")).not.toBeNull();
    expect(overlayKeyboardOwned()).toBe(true);

    // The tab switch itself, as `ResultsPanel` performs it. `await`, because
    // the observer behind this delivers on the microtask after the mutation.
    await act(async () => {
      view.rerender(<Panel hidden />);
    });

    expect(view.queryByRole("dialog")).toBeNull();
    expect(overlayKeyboardOwned()).toBe(false);
  });

  it("lands on the results tab when the anchor can no longer take focus back", async () => {
    // Roadmap 067 review: the dismissal above closes the card BECAUSE the
    // anchor's panel went `hidden` — which is exactly when the anchor cannot
    // take the focus back. The restore was a silent no-op, the card unmounted a
    // beat later, and focus fell to <body>, where the next Tab restarts at the
    // skip link. jsdom models neither `hidden` nor `disabled` as a focus barrier
    // (see `ShortcutSheet`'s own tests), so the refusal is spelled out directly.
    const view = render(<TabbedPanel hidden={false} />);
    const anchor = view.getByRole("button", { name: "packageRules[201]" });
    act(() => {
      fireEvent.click(anchor);
    });
    anchor.focus = () => undefined;

    await act(async () => {
      view.rerender(<TabbedPanel hidden />);
    });

    expect(view.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(view.getByRole("tab"));
  });

  it("keeps one card open at a time, so one Escape gives the keyboard back", () => {
    // Roadmap 067 review: light dismiss is a `mousedown` listener, and keyboard
    // activation fires none — which is what `fireEvent.click` reproduces here.
    // So Enter on one reference, Shift+Tab, Enter on the next left TWO cards up,
    // a state the pointer can never produce; the ladder then popped one layer
    // per press, and the card left standing kept `overlayKeyboardOwned()` true,
    // with `e`, `r`, `1`–`7` and Home/End dead until a second Escape.
    const view = render(<TwoAnchors />);
    act(() => {
      fireEvent.click(view.getByRole("button", { name: "packageRules[201]" }));
    });
    act(() => {
      fireEvent.click(view.getByRole("button", { name: "packageRules[202]" }));
    });

    const dialogs = view.queryAllByRole("dialog");
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]?.getAttribute("aria-label")).toContain("packageRules[202]");
    expect(
      view.getByRole("button", { name: "packageRules[201]" }).getAttribute("aria-expanded"),
    ).toBe("false");

    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(view.queryAllByRole("dialog")).toHaveLength(0);
    expect(overlayKeyboardOwned()).toBe(false);
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
