import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StageRailPreview } from "./StageRail";

/**
 * Roadmap 075 (the landing transition) — what the landing's rail narrates
 * while a run is in flight.
 *
 * The two facts worth pinning are both honesty rules rather than looks: the
 * narration is a paced guess (the engine reports once, at the end), so it may
 * never claim the FINAL stage, and it may never keep a timer alive past the
 * landing it belongs to.
 */

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

/** jsdom has no `matchMedia`, and `prefersReducedMotion` calls it on mount. */
function stubMatchMedia(reduced: boolean) {
  window.matchMedia = (query: string) =>
    ({
      matches: reduced,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

/** The interval's period — see `RUNNING_STEP_MS` in StageRail.tsx. */
const STEP_MS = 450;

const glyphs = () => document.querySelectorAll(".stage-rail-preview .stage-rail-glyph");
const lit = () => document.querySelectorAll(".stage-rail-preview .stage-rail-glyph.lit");
const caption = () => document.querySelector(".stage-rail-caption")?.textContent ?? "";

function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("the landing's stage rail", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is inert and unlit before a run", () => {
    render(<StageRailPreview running={false} />);

    expect(glyphs().length).toBe(8);
    expect(lit().length).toBe(0);
    expect(caption()).toContain("The run lights these up in order");
    // Nothing to step: an idle rail must not hold a timer at all.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("walks the stages while running and holds one short of the finish", () => {
    render(<StageRailPreview running={true} />);

    // The first stage is lit from the first frame — the narration starts where
    // the run does, not one interval later.
    expect(lit().length).toBe(1);
    expect(caption()).toBe("starting Renovate's own code…");

    tick(STEP_MS);
    expect(lit().length).toBe(2);
    expect(caption()).toBe("applying inherited defaults…");

    tick(STEP_MS * 3);
    expect(lit().length).toBe(5);
    expect(caption()).toBe("normalizing shorthand…");

    // Long past the last interval it would ever need: seven of the eight dots
    // are lit and the eighth — Merge — is not. Only the real result lights
    // that one, and by then this component is gone.
    tick(STEP_MS * 20);
    expect(lit().length).toBe(7);
    expect(glyphs()[7]?.classList.contains("lit")).toBe(false);
    expect(caption()).toBe("merging the effective config…");
  });

  it("says it once, without stepping, when the reader asked for less motion", () => {
    stubMatchMedia(true);
    render(<StageRailPreview running={true} />);

    expect(lit().length).toBe(0);
    expect(caption()).toBe("Running Renovate's own code…");

    tick(STEP_MS * 10);
    expect(lit().length).toBe(0);
    expect(caption()).toBe("Running Renovate's own code…");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("takes its timer with it when the result unmounts the landing", () => {
    const view = render(<StageRailPreview running={true} />);
    tick(STEP_MS * 2);
    expect(vi.getTimerCount()).toBe(1);

    view.unmount();

    expect(vi.getTimerCount()).toBe(0);
    // The classic leak: a queued tick calling setState on a gone component.
    expect(() => tick(STEP_MS * 5)).not.toThrow();
  });
});
