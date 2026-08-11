import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEscapeLayer } from "@/hooks/use-escape-layer";
import { type EscapePriority, ESCAPE_PRIORITY } from "@/lib/escape-stack";
import { Term } from "./glossary";

/**
 * Roadmap 067 review — who owns Escape when a glossary card is up.
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
});
