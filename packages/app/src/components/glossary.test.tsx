import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEscapeLayer } from "@/hooks/use-escape-layer";
import { type EscapePriority, ESCAPE_PRIORITY } from "@/lib/escape-stack";
import { Term } from "./glossary";

/**
 * Roadmap 068 review — who owns Escape when a glossary card is up.
 *
 * The card opens on FOCUS, so a keyboard user always has one; claiming the key
 * unconditionally therefore made the layer UNDERNEATH undismissable, which is
 * the case this file pins from both sides.
 */

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

function Scene({ onEscape, priority }: { onEscape: () => void; priority: EscapePriority }) {
  useEscapeLayer(true, onEscape, priority);
  return <Term id="preset">a preset</Term>;
}

function openCard(term: HTMLElement) {
  fireEvent.focus(term);
  expect(document.querySelector(".glossary-card")).not.toBeNull();
}

/**
 * The repo-load panel, in miniature: a `<form>` that closes itself on Escape,
 * with a `Term` inside it — `RepoLoadForm` renders one on the "also load the
 * org's inherited config" row.
 */
function PanelScene({ onEscape, onCancel }: { onEscape: () => void; onCancel: () => void }) {
  useEscapeLayer(true, onEscape, ESCAPE_PRIORITY.ambient);
  return (
    <form
      aria-label="Load from repository"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <Term id="preset">a preset</Term>
    </form>
  );
}

describe("the glossary card's Escape", () => {
  it("dismisses the card and spares the furniture underneath", () => {
    // The simulator's return pill is `ambient`: the reader cannot even see it
    // from a glossary term, so a press meant for the card must not destroy it.
    const pill = vi.fn();
    const { getByText } = render(<Scene onEscape={pill} priority={ESCAPE_PRIORITY.ambient} />);
    const term = getByText("a preset");
    openCard(term);

    fireEvent.keyDown(term, { key: "Escape" });
    expect(document.querySelector(".glossary-card")).toBeNull();
    expect(pill).not.toHaveBeenCalled();
  });

  it("stands aside for a layer the user actually opened", () => {
    // Tab onto a `ProvenanceChip` inside an open rule-evidence popover and a
    // card is up whether the user wanted one or not. Claiming there left the
    // popover with no keyboard way out at all: `stopPropagation` on React's
    // root listener never lets the press reach the ladder's document listener.
    const popover = vi.fn();
    const { getByText } = render(<Scene onEscape={popover} priority={ESCAPE_PRIORITY.popover} />);
    const term = getByText("a preset");
    openCard(term);

    fireEvent.keyDown(term, { key: "Escape" });
    expect(popover).toHaveBeenCalledOnce();
  });

  it("lets the panel it sits inside cancel on the same press", () => {
    // The `stopPropagation` this used to claim with was not just the ladder's
    // press to take: React dispatches from the root container, so it ended the
    // native event for every ANCESTOR handler too. The repo-load panel closes
    // itself on Escape and renders a `Term`, and focusing that term always opens
    // a card — so cancelling a panel the user had asked to cancel took two
    // presses. `preventDefault` claims only the listener that reads it.
    const pill = vi.fn();
    const cancel = vi.fn();
    const { getByText } = render(<PanelScene onEscape={pill} onCancel={cancel} />);
    const term = getByText("a preset");
    openCard(term);

    fireEvent.keyDown(term, { key: "Escape" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(document.querySelector(".glossary-card")).toBeNull();
    // And the layer underneath still survives both of them.
    expect(pill).not.toHaveBeenCalled();
  });
});
