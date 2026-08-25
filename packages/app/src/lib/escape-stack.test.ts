import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ESCAPE_PRIORITY,
  type EscapePriority,
  claimModalKeyboard,
  escapeLayerCount,
  handleEscape,
  modalKeyboardOwned,
  overlayKeyboardOwned,
  pushEscapeLayer,
} from "./escape-stack";

/**
 * Roadmap 068 — the Escape ladder's ordering. This replaced the return pill
 * asking the DOM whether a rule-evidence card happened to be mounted, so the
 * cases that matter are the ones that hack got right by accident and the ones
 * it could not have survived: three layers deep, teardown out of order, and a
 * popover that registers BEFORE the pill (a jump out of the thread it sits on)
 * yet still has to win.
 */

const releases: (() => void)[] = [];

function layer(handler: () => void, priority: EscapePriority = ESCAPE_PRIORITY.ambient) {
  const release = pushEscapeLayer(handler, priority);
  releases.push(release);
  return release;
}

function modal(): () => void {
  const release = claimModalKeyboard();
  releases.push(release);
  return release;
}

/* eslint-disable vitest/no-standalone-expect -- asserting the teardown
   invariant is the POINT of this hook, not an escaped assertion. The escape
   stack is module-level state shared by every test in this file: a leaked
   claim makes every LATER test's `handleEscape()` a silent no-op, so the test
   that leaked has to be the one that fails. Moving these into each test would
   be the same three assertions copied a dozen times, and would still not cover
   a test that forgot them. */
afterEach(() => {
  while (releases.length > 0) {
    releases.pop()?.();
  }
  expect(escapeLayerCount()).toBe(0);
  // Nothing registered AND no modal still holding the keyboard — a leaked claim
  // would make every later test's `handleEscape()` a silent no-op, and would
  // wedge Home/End on the page for good.
  expect(modalKeyboardOwned()).toBe(false);
  expect(handleEscape()).toBe(false);
});
/* eslint-enable vitest/no-standalone-expect */

describe("escape stack", () => {
  it("runs only the topmost layer of a rank", () => {
    const below = vi.fn();
    const above = vi.fn();
    layer(below);
    layer(above);

    expect(handleEscape()).toBe(true);
    expect(above).toHaveBeenCalledOnce();
    expect(below).not.toHaveBeenCalled();
  });

  it("falls back to the layer underneath once the top one releases", () => {
    const pill = vi.fn();
    const popover = vi.fn();
    layer(pill);
    const closePopover = layer(popover);

    handleEscape();
    closePopover();
    handleEscape();

    expect(popover).toHaveBeenCalledOnce();
    expect(pill).toHaveBeenCalledOnce();
  });

  it("reports that nothing consumed the key when the stack is empty", () => {
    expect(handleEscape()).toBe(false);
  });

  it("removes its own entry when layers release out of order", () => {
    const first = vi.fn();
    const second = vi.fn();
    const third = vi.fn();
    layer(first);
    const releaseSecond = layer(second);
    layer(third);

    // The middle layer goes first — the naive `stack.pop()` would have thrown
    // away the top one instead.
    releaseSecond();
    expect(escapeLayerCount()).toBe(2);

    handleEscape();
    expect(third).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });

  it("ignores a repeated release", () => {
    const only = vi.fn();
    const release = layer(only);
    release();
    release();
    expect(escapeLayerCount()).toBe(0);
  });

  it("ranks a popover above a pill pushed after it", () => {
    const popover = vi.fn();
    const pill = vi.fn();
    // The order a jump out of a thread that already has a card open produces:
    // the card is up, then `onJumpFrom` shows the return pill.
    layer(popover, ESCAPE_PRIORITY.popover);
    layer(pill, ESCAPE_PRIORITY.ambient);

    handleEscape();
    expect(popover).toHaveBeenCalledOnce();
    expect(pill).not.toHaveBeenCalled();
  });

  it("walks the ladder down as each rank releases", () => {
    const pill = vi.fn();
    const menu = vi.fn();
    const popover = vi.fn();
    layer(pill, ESCAPE_PRIORITY.ambient);
    const closeMenu = layer(menu, ESCAPE_PRIORITY.menu);
    const closePopover = layer(popover, ESCAPE_PRIORITY.popover);

    handleEscape();
    closePopover();
    handleEscape();
    closeMenu();
    handleEscape();

    expect(popover).toHaveBeenCalledOnce();
    expect(menu).toHaveBeenCalledOnce();
    expect(pill).toHaveBeenCalledOnce();
  });

  it("prefers the most recent layer within one rank", () => {
    const first = vi.fn();
    const second = vi.fn();
    layer(first, ESCAPE_PRIORITY.popover);
    layer(second, ESCAPE_PRIORITY.popover);

    handleEscape();
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  it("declines the key while a modal owns the keyboard, and reports that it did not consume it", () => {
    const pill = vi.fn();
    layer(pill);
    const release = modal();

    // The `?` sheet is up: the browser owns Escape, and the ladder must not
    // claim it — a `true` here is what suppressed the dialog's close request.
    expect(handleEscape()).toBe(false);
    expect(pill).not.toHaveBeenCalled();

    release();
    expect(handleEscape()).toBe(true);
    expect(pill).toHaveBeenCalledOnce();
  });

  it("stays claimed until every modal releases", () => {
    const pill = vi.fn();
    layer(pill);
    const releaseOuter = modal();
    const releaseInner = modal();

    releaseInner();
    // Releasing twice must not credit the count twice, either.
    releaseInner();
    expect(handleEscape()).toBe(false);

    releaseOuter();
    expect(handleEscape()).toBe(true);
    expect(pill).toHaveBeenCalledOnce();
  });
});

/**
 * The second question the stack answers, for the bare-key jump layer (`e`, `r`,
 * `1`–`7`): is something drawn OVER the page right now? The rank is what makes
 * the answer possible — `escapeLayerCount() > 0` would take the jump keys away
 * for the whole time the simulator's return pill is up.
 */
describe("overlay keyboard ownership", () => {
  it("reports nothing over the page when no layer is registered", () => {
    expect(overlayKeyboardOwned()).toBe(false);
  });

  it("counts a popover and a menu, but not an ambient layer on its own", () => {
    const releasePill = layer(vi.fn(), ESCAPE_PRIORITY.ambient);
    // The return pill is furniture the reader reads past: `2` must still switch
    // tabs while it is up, or a thread-navigation detour turns the jump layer
    // off for its whole duration.
    expect(overlayKeyboardOwned()).toBe(false);

    const releaseMenu = layer(vi.fn(), ESCAPE_PRIORITY.menu);
    expect(overlayKeyboardOwned()).toBe(true);
    releaseMenu();

    const releasePopover = layer(vi.fn(), ESCAPE_PRIORITY.popover);
    expect(overlayKeyboardOwned()).toBe(true);

    releasePopover();
    expect(overlayKeyboardOwned()).toBe(false);
    releasePill();
  });

  it("asks the top of the ladder, not the bottom", () => {
    // The registration order a jump out of a thread with a card open produces:
    // the popover is pushed first and the pill after it, so reading the LAST
    // entry would report the page as uncovered while the card is still there.
    const releasePopover = layer(vi.fn(), ESCAPE_PRIORITY.popover);
    const releasePill = layer(vi.fn(), ESCAPE_PRIORITY.ambient);
    expect(overlayKeyboardOwned()).toBe(true);

    releasePopover();
    expect(overlayKeyboardOwned()).toBe(false);
    releasePill();
  });

  it("is not the modal question", () => {
    // A modal takes the keyboard through `claimModalKeyboard`, and the bare
    // keys are switched off by App's `keysLive` while the sheet is up. Nothing
    // is layered over the page here, and this query must not pretend otherwise.
    const release = modal();
    expect(overlayKeyboardOwned()).toBe(false);
    release();
  });
});

describe("modal keyboard ownership", () => {
  it("reports whether a modal is up, for the handlers that are not the ladder", () => {
    // `useHomeEndPageScroll` reads exactly this: with the `?` sheet open, End
    // must scroll the sheet's own overflowing rows, not the inert page behind
    // it. No layer is registered here — the query is about the modal alone.
    expect(modalKeyboardOwned()).toBe(false);
    const release = modal();
    expect(modalKeyboardOwned()).toBe(true);
    release();
    expect(modalKeyboardOwned()).toBe(false);
  });

  it("hands the keyboard back only when the last modal releases", () => {
    const releaseOuter = modal();
    const releaseInner = modal();
    releaseInner();
    expect(modalKeyboardOwned()).toBe(true);
    releaseOuter();
    expect(modalKeyboardOwned()).toBe(false);
  });
});
