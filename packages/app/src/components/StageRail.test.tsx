import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// jsdom has no `matchMedia`, and `prefersReducedMotion` calls it on mount.
import { stubMatchMedia } from "@tools/test/jsdom-stubs";
import { StageRailPreview } from "./StageRail";

/**
 * Roadmap 075 (the landing transition) — what the landing's rail narrates
 * while a run is in flight.
 *
 * The facts worth pinning are honesty rules rather than looks: the narration
 * is a paced guess (the engine reports once, at the end), so it may never
 * claim the FINAL stage nor any verdict — a walked node wears the activity
 * accent (`lit`), with the rail's hollow `skipped` for the one pre-run fact
 * the inputs do state, an absent layer (076 review) — and it may never keep
 * a timer alive past the landing it belongs to.
 */

/** The interval's period — see `RUNNING_STEP_MS` in StageRail.tsx. */
const STEP_MS = 160;

const glyphs = () => document.querySelectorAll(".stage-rail-preview .stage-rail-glyph");
/** The nodes the walk has passed — the accent `lit` (activity, never a
 *  verdict), or the rail's hollow `skipped` for a layer the inputs lack. */
const walked = () =>
  document.querySelectorAll(
    ".stage-rail-preview .stage-rail-glyph.lit, .stage-rail-preview .stage-rail-glyph.skipped",
  );
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
    const onWalkEnd = vi.fn();
    render(<StageRailPreview running={false} onWalkEnd={onWalkEnd} skippedStages={[]} />);

    expect(glyphs().length).toBe(8);
    expect(walked().length).toBe(0);
    expect(caption()).toContain("The run lights these up in order");
    // Nothing to step: an idle rail must not hold a timer at all.
    expect(vi.getTimerCount()).toBe(0);
    expect(onWalkEnd).not.toHaveBeenCalled();
  });

  it("walks the stages while running and holds one short of the finish", () => {
    const onWalkEnd = vi.fn();
    render(<StageRailPreview running={true} onWalkEnd={onWalkEnd} skippedStages={[]} />);

    // The first stage is lit from the first frame — the narration starts where
    // the run does, not one interval later.
    expect(walked().length).toBe(1);
    expect(caption()).toBe("starting Renovate's own code…");

    tick(STEP_MS);
    expect(walked().length).toBe(2);
    expect(caption()).toBe("applying inherited defaults…");

    tick(STEP_MS * 3);
    expect(walked().length).toBe(5);
    expect(caption()).toBe("normalizing shorthand…");

    // Long past the last interval it would ever need: seven of the eight dots
    // are lit and the eighth — Merge — is not. Only the real result lights
    // that one, and by then this component is gone.
    tick(STEP_MS * 20);
    expect(walked().length).toBe(7);
    expect(glyphs()[7]?.classList.contains("preview")).toBe(true);
    expect(caption()).toBe("merging the effective config…");
  });

  it("shows a stage the inputs will skip with the rail's hollow glyph", () => {
    // No 008 layers — the usual landing — so the walk must not paint the
    // Global and Inherited nodes with the activity accent as if they ran.
    render(
      <StageRailPreview
        running={true}
        onWalkEnd={() => undefined}
        skippedStages={["global", "inherit"]}
      />,
    );

    tick(STEP_MS * 3);
    expect(glyphs()[0]?.classList.contains("skipped")).toBe(true);
    expect(glyphs()[1]?.classList.contains("skipped")).toBe(true);
    expect(glyphs()[2]?.classList.contains("lit")).toBe(true);
    expect(walked().length).toBe(4);
  });

  it("signals the walk's end one step after its last frame, exactly once", () => {
    const onWalkEnd = vi.fn();
    render(<StageRailPreview running={true} onWalkEnd={onWalkEnd} skippedStages={[]} />);

    // Seven steps reach the last frame (the ring on Merge)…
    tick(STEP_MS * 7);
    expect(caption()).toBe("merging the effective config…");
    expect(onWalkEnd).not.toHaveBeenCalled();

    // …which keeps the screen for one full step before the signal — the
    // commit App is holding for (executeRun's landing hold) fires off this.
    tick(STEP_MS);
    expect(onWalkEnd).toHaveBeenCalledTimes(1);

    tick(STEP_MS * 10);
    expect(onWalkEnd).toHaveBeenCalledTimes(1);
  });

  it("says it once, without stepping, when the reader asked for less motion", () => {
    stubMatchMedia(true);
    const onWalkEnd = vi.fn();
    render(<StageRailPreview running={true} onWalkEnd={onWalkEnd} skippedStages={[]} />);

    expect(walked().length).toBe(0);
    expect(caption()).toBe("Running Renovate's own code…");
    // No walk means nothing to hold the results for: the signal is immediate.
    expect(onWalkEnd).toHaveBeenCalledTimes(1);

    tick(STEP_MS * 10);
    expect(walked().length).toBe(0);
    expect(caption()).toBe("Running Renovate's own code…");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("takes its timer with it when the result unmounts the landing", () => {
    const view = render(
      <StageRailPreview running={true} onWalkEnd={() => undefined} skippedStages={[]} />,
    );
    tick(STEP_MS * 2);
    expect(vi.getTimerCount()).toBe(1);

    view.unmount();

    expect(vi.getTimerCount()).toBe(0);
    // The classic leak: a queued tick calling setState on a gone component.
    expect(() => tick(STEP_MS * 5)).not.toThrow();
  });
});
