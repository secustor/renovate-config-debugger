import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { claimModalKeyboard, ESCAPE_PRIORITY, pushEscapeLayer } from "@/lib/escape-stack";
import { useHomeEndPageScroll } from "./scroll-ergonomics";

/**
 * Roadmap 016/075 — the Home/End page-scroll hook. The target predicates it
 * asks are tested next door, in `lib/keyboard-target.test.tsx`.
 */
function HomeEndHarness() {
  useHomeEndPageScroll();
  return null;
}

describe("useHomeEndPageScroll", () => {
  it("scrolls the page on End", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    render(<HomeEndHarness />);

    fireEvent.keyDown(window, { key: "End" });
    expect(scrollTo).toHaveBeenCalledOnce();
    scrollTo.mockRestore();
  });

  it("stands aside while a modal owns the keyboard", () => {
    // Roadmap 068: with the `?` sheet open, End belongs to the sheet's own
    // overflowing row list. Scrolling here would move the INERT page behind the
    // dialog, and `preventDefault` would stop the dialog scrolling at all.
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    render(<HomeEndHarness />);
    const release = claimModalKeyboard();

    const claimed = !fireEvent.keyDown(window, { key: "End" });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(claimed).toBe(false);

    release();
    fireEvent.keyDown(window, { key: "Home" });
    expect(scrollTo).toHaveBeenCalledOnce();
    scrollTo.mockRestore();
  });

  it("claims the key and scrolls nothing while a popover or menu is up", () => {
    // 2026-08-11 review: the same gate `e`, `r` and `1`–`7` take. CLAIMED,
    // unlike the modal case above — a popover scrolls nothing itself, so
    // merely declining End would hand the page scroll straight back to the
    // browser's default.
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    render(<HomeEndHarness />);
    const release = pushEscapeLayer(() => undefined, ESCAPE_PRIORITY.popover);

    const claimed = !fireEvent.keyDown(window, { key: "End" });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(claimed).toBe(true);

    release();
    fireEvent.keyDown(window, { key: "End" });
    expect(scrollTo).toHaveBeenCalledOnce();
    scrollTo.mockRestore();
  });

  it("scrolls the PANE the gesture was made in, not the page (roadmap 075)", () => {
    // The v2 shell's panes are the scrollers and the document does not move at
    // all, so the rule 016 wrote down — Home/End move the surface the reader is
    // reading — has to name that surface rather than always the page.
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    render(<HomeEndHarness />);
    const pane = document.createElement("div");
    pane.className = "results-col";
    const button = document.createElement("button");
    pane.appendChild(button);
    document.body.appendChild(pane);
    // jsdom lays nothing out, so the "is there anything to scroll?" test has to
    // be answered explicitly — which is also the case this asserts: a pane that
    // overflows takes the key.
    Object.defineProperty(pane, "scrollHeight", { configurable: true, value: 2_000 });
    Object.defineProperty(pane, "clientHeight", { configurable: true, value: 500 });

    fireEvent.keyDown(button, { key: "End" });
    expect(pane.scrollTop).toBe(2_000);
    expect(scrollTo).not.toHaveBeenCalled();

    fireEvent.keyDown(button, { key: "Home" });
    expect(pane.scrollTop).toBe(0);
    expect(scrollTo).not.toHaveBeenCalled();

    // A pane with nothing to scroll is not a target: the key falls through to
    // the document rather than doing nothing at all.
    Object.defineProperty(pane, "scrollHeight", { configurable: true, value: 500 });
    fireEvent.keyDown(button, { key: "End" });
    expect(scrollTo).toHaveBeenCalledOnce();

    pane.remove();
    scrollTo.mockRestore();
  });

  it("keeps scrolling under an ambient layer — the simulator's return pill", () => {
    // The rank is the whole reason this asks `overlayKeyboardOwned()` rather
    // than "is any layer open": the pill is furniture to read past and stays up
    // for a whole navigation detour.
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    render(<HomeEndHarness />);
    const release = pushEscapeLayer(() => undefined, ESCAPE_PRIORITY.ambient);

    fireEvent.keyDown(window, { key: "End" });
    expect(scrollTo).toHaveBeenCalledOnce();

    release();
    scrollTo.mockRestore();
  });
});
