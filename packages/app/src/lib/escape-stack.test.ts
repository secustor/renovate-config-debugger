import { afterEach, describe, expect, it, vi } from "vitest";
import { escapeLayerCount, handleEscape, pushEscapeLayer } from "./escape-stack";

/**
 * Roadmap 067 — the Escape ladder's ordering. This replaced the return pill
 * asking the DOM whether a rule-evidence card happened to be mounted, so the
 * cases that matter are the ones that hack got right by accident and the ones
 * it could not have survived: three layers deep, and teardown out of order.
 */

const releases: (() => void)[] = [];

function layer(handler: () => void): () => void {
  const release = pushEscapeLayer(handler);
  releases.push(release);
  return release;
}

afterEach(() => {
  while (releases.length > 0) {
    releases.pop()?.();
  }
  expect(escapeLayerCount()).toBe(0);
});

describe("escape stack", () => {
  it("runs only the topmost layer", () => {
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
});
