import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flashTarget } from "./motion";

/**
 * Roadmap 068 review — `flashTarget` needs a real `Element` (`classList`,
 * `getBoundingClientRect`), which the node-environment `unit` project doesn't
 * have — hence `.test.tsx` here, to land in the jsdom `render` project (same
 * reasoning as `hooks/scroll-ergonomics.test.tsx`).
 */

const FLASH_MS = 1600;

describe("flashTarget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not let an earlier flash's timeout strip a later flash on the same element", () => {
    const el = document.createElement("div");

    flashTarget(el);
    expect(el.classList.contains("rcd-flash")).toBe(true);

    // A second landing on the same target, well inside the first flash's
    // 1.6s window.
    vi.advanceTimersByTime(800);
    flashTarget(el);
    expect(el.classList.contains("rcd-flash")).toBe(true);

    // The FIRST call's original deadline (800ms + 800ms = 1600ms after it
    // started). Pre-fix, its `setTimeout` fires here and removes the class
    // out from under the second, still-running flash.
    vi.advanceTimersByTime(FLASH_MS - 800);
    expect(el.classList.contains("rcd-flash")).toBe(true);

    // The SECOND call's own deadline (800ms + 1600ms after the first call).
    vi.advanceTimersByTime(800);
    expect(el.classList.contains("rcd-flash")).toBe(false);
  });

  it("removes the class after one flash's own duration when there is no overlap", () => {
    const el = document.createElement("div");

    flashTarget(el);
    vi.advanceTimersByTime(FLASH_MS - 1);
    expect(el.classList.contains("rcd-flash")).toBe(true);

    vi.advanceTimersByTime(1);
    expect(el.classList.contains("rcd-flash")).toBe(false);
  });
});
