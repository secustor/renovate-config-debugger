import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ESCAPE_PRIORITY,
  type EscapePriority,
  escapeLayerCount,
  handleEscape,
  pushEscapeLayer,
  suspendEscapeLayers,
} from "./escape-stack";

/**
 * Roadmap 067 — the Escape ladder's ordering. This replaced the return pill
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

function suspend(): () => void {
  const release = suspendEscapeLayers();
  releases.push(release);
  return release;
}

afterEach(() => {
  while (releases.length > 0) {
    releases.pop()?.();
  }
  expect(escapeLayerCount()).toBe(0);
  // Nothing registered AND nothing suspended — a leaked suspension would make
  // every later test's `handleEscape()` a silent no-op.
  expect(handleEscape()).toBe(false);
});

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

  it("declines the key while suspended, and reports that it did not consume it", () => {
    const pill = vi.fn();
    layer(pill);
    const resume = suspend();

    // The `?` sheet is up: the browser owns Escape, and the ladder must not
    // claim it — a `true` here is what suppressed the dialog's close request.
    expect(handleEscape()).toBe(false);
    expect(pill).not.toHaveBeenCalled();

    resume();
    expect(handleEscape()).toBe(true);
    expect(pill).toHaveBeenCalledOnce();
  });

  it("stays suspended until every suspension releases", () => {
    const pill = vi.fn();
    layer(pill);
    const resumeOuter = suspend();
    const resumeInner = suspend();

    resumeInner();
    // Releasing twice must not credit the count twice, either.
    resumeInner();
    expect(handleEscape()).toBe(false);

    resumeOuter();
    expect(handleEscape()).toBe(true);
    expect(pill).toHaveBeenCalledOnce();
  });
});
