import { describe, expect, it } from "vitest";
import { nextTabIndex } from "./roving-tabs";

/** Roadmap 067 — the tab strip's arrow arithmetic, wrap-around included. */
describe("nextTabIndex", () => {
  it("moves one step and wraps at both ends", () => {
    expect(nextTabIndex("ArrowRight", 0, 7)).toBe(1);
    expect(nextTabIndex("ArrowRight", 6, 7)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 3, 7)).toBe(2);
    expect(nextTabIndex("ArrowLeft", 0, 7)).toBe(6);
  });

  it("sends Home and End to the ends", () => {
    expect(nextTabIndex("Home", 4, 7)).toBe(0);
    expect(nextTabIndex("End", 4, 7)).toBe(6);
  });

  it("declines every other key, so typing and page scroll are untouched", () => {
    for (const key of ["ArrowUp", "Enter", " ", "a", "Tab", "Escape"]) {
      expect(nextTabIndex(key, 2, 7)).toBeNull();
    }
  });

  it("declines when there are no tabs at all", () => {
    expect(nextTabIndex("ArrowRight", 0, 0)).toBeNull();
  });
});
