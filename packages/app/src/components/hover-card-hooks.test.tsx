import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HoverCardAnchor } from "./hover-card";
import { SHOW_SCROLL_GRACE_MS } from "./hover-card-hooks";

/**
 * Roadmap 069 review — WHICH scrolls take a hover card down with them.
 *
 * The card is `position: fixed` at coordinates read once, when it opened, so
 * any scroll that moves its anchor leaves it pointing at whatever slid under
 * it. Scroll events do not bubble, so the hide-on-scroll listener only heard
 * the document until it registered in the CAPTURE phase — and every anchor the
 * card actually serves (a `description` string in `pre.config-view`, a term in
 * the preset tree's windowed list) sits inside a nested `overflow: auto` box.
 *
 * The other direction, which the review after it found: the scroll a browser
 * fires to bring a Tab-focused anchor into view must NOT be one of them.
 */

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

// The hide-on-scroll now has a wall-clock grace, so every test in this file has
// to say which side of it its scroll falls on.
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Puts a scroll outside the show's own grace window — i.e. makes it the
 *  reader's, which is the only kind that dismisses. */
function leaveShowGrace(): void {
  act(() => {
    vi.advanceTimersByTime(SHOW_SCROLL_GRACE_MS);
  });
}

/** An anchor inside a nested scroller — the arrangement of every real one. */
function Scene() {
  return (
    <div data-testid="scroller">
      <HoverCardAnchor className="probe-card" card={<p>who wrote this</p>}>
        {(handlers) => (
          <span tabIndex={0} {...handlers}>
            an anchor
          </span>
        )}
      </HoverCardAnchor>
    </div>
  );
}

function openCard(anchor: HTMLElement) {
  fireEvent.focus(anchor);
  expect(document.querySelector(".probe-card")).not.toBeNull();
}

/** jsdom lays nothing out, so an anchor's box is whatever we say it is. */
function placeAt(el: HTMLElement, top: number): void {
  el.getBoundingClientRect = (): DOMRect => {
    const rect = {
      x: 10,
      y: top,
      left: 10,
      right: 110,
      top,
      bottom: top + 20,
      width: 100,
      height: 20,
    };
    return { ...rect, toJSON: () => rect };
  };
}

/** The portalled card's `top`, i.e. the anchor box it is currently placed against. */
function cardTop(): string | undefined {
  return document.querySelector<HTMLElement>(".probe-card")?.style.top;
}

describe("the hover card's hide-on-scroll", () => {
  it("hides when the container the anchor sits in scrolls", () => {
    // `fireEvent.scroll` dispatches a non-bubbling event, exactly as a browser
    // does for an element scroll: before the capture flag this reached no
    // window listener at all and the card stayed, fixed, over new content.
    const { getByText, getByTestId } = render(<Scene />);
    openCard(getByText("an anchor"));

    leaveShowGrace();
    fireEvent.scroll(getByTestId("scroller"));
    expect(document.querySelector(".probe-card")).toBeNull();
  });

  it("still hides on a document scroll", () => {
    const { getByText } = render(<Scene />);
    openCard(getByText("an anchor"));

    leaveShowGrace();
    fireEvent.scroll(window);
    expect(document.querySelector(".probe-card")).toBeNull();
  });
});

/**
 * Tab onto an anchor that is only partly in view and the browser scrolls it
 * into view itself. That scroll is queued BEFORE the card paints, so it lands
 * in the freshly registered capture listener a frame after the card opened —
 * which used to close it again, making every not-fully-visible anchor
 * unreachable by keyboard. The grace is wall-clock, so fake timers decide which
 * side of it a scroll falls on.
 */
describe("the scroll the show itself caused", () => {
  it("re-anchors the card instead of dismissing it", () => {
    const { getByText, getByTestId } = render(<Scene />);
    const anchor = getByText("an anchor");

    placeAt(anchor, 40);
    openCard(anchor);
    expect(cardTop()).toBe("66px");

    // `scrollIntoView` moved the anchor up the viewport; the event arrives in
    // the same tick the card opened in.
    placeAt(anchor, 100);
    fireEvent.scroll(getByTestId("scroller"));

    expect(document.querySelector(".probe-card")).not.toBeNull();
    // …and follows the anchor, rather than staying at the box it opened with.
    expect(cardTop()).toBe("126px");
  });

  it("hides on a scroll that arrives after the grace window", () => {
    const { getByText, getByTestId } = render(<Scene />);
    const anchor = getByText("an anchor");

    placeAt(anchor, 40);
    openCard(anchor);

    leaveShowGrace();
    placeAt(anchor, 100);
    fireEvent.scroll(getByTestId("scroller"));

    expect(document.querySelector(".probe-card")).toBeNull();
  });
});
