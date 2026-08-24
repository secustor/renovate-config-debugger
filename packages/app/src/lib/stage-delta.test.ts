import { describe, expect, it } from "vitest";
import type { StageActivity } from "./stage-activity";
import { stageDelta, type StageDeltaFacts, stageHint } from "./stage-delta";

const FACTS: StageDeltaFacts = { presetCount: 0, effectiveKeys: null };

function activity(level: StageActivity["level"], count?: number): StageActivity {
  return count === undefined ? { level } : { level, count };
}

describe("stageDelta", () => {
  it("marks a skipped stage with the empty-set glyph, dimmed", () => {
    expect(stageDelta("global", activity("skipped"), FACTS)).toEqual({ text: "∅", tone: "dim" });
  });

  it("reports migrate's rewrites as a churn count, not an added/removed pair", () => {
    // A `migration-applied` step is a rewrite, not necessarily an option
    // swapped for another one — `Δ N` is the number the trace actually knows.
    expect(stageDelta("migrate", activity("changed", 2), FACTS)).toEqual({
      text: "Δ 2",
      tone: "warn",
    });
  });

  it("reports massage's changes the same way", () => {
    expect(stageDelta("massage", activity("changed", 1), FACTS)).toEqual({
      text: "Δ 1",
      tone: "warn",
    });
  });

  it("names validate's warnings as warnings", () => {
    expect(stageDelta("validate", activity("changed", 3), FACTS)).toEqual({
      text: "3 warn",
      tone: "warn",
    });
  });

  it("counts validate's errors when it has them, and says so when it has none", () => {
    expect(stageDelta("validate", activity("error", 2), FACTS)).toEqual({
      text: "2 err",
      tone: "error",
    });
    expect(stageDelta("preset", activity("error"), FACTS)).toEqual({
      text: "failed",
      tone: "error",
    });
  });

  it("shows the resolved preset count on the presets stage, and announces it", () => {
    const delta = stageDelta("preset", activity("clean"), { ...FACTS, presetCount: 1102 });
    const formatted = new Intl.NumberFormat().format(1102);
    expect(delta).toEqual({
      text: `+${formatted}`,
      tone: "ok",
      announce: `${formatted} presets resolved`,
    });
  });

  it("falls back to the clean marker when the presets stage resolved nothing", () => {
    expect(stageDelta("preset", activity("clean"), FACTS)).toEqual({ text: "Δ 0", tone: "dim" });
  });

  it("shows merge's key count only once the effective tally has arrived", () => {
    expect(stageDelta("merge", activity("clean"), FACTS)).toBeNull();
    expect(stageDelta("merge", activity("clean"), { ...FACTS, effectiveKeys: 62 })).toEqual({
      text: "= 62",
      tone: "neutral",
      announce: "62 options in the effective config",
    });
  });

  it("marks an otherwise unremarkable clean stage as dimmed zero", () => {
    expect(stageDelta("parse", activity("clean"), FACTS)).toEqual({ text: "Δ 0", tone: "dim" });
  });
});

describe("stageHint", () => {
  it("says what a stage did, in the card header's voice", () => {
    expect(stageHint("migrate", activity("changed", 1), FACTS)).toBe(
      "1 deprecated option rewritten",
    );
    expect(stageHint("migrate", activity("changed", 2), FACTS)).toBe(
      "2 deprecated options rewritten",
    );
    expect(stageHint("massage", activity("changed", 3), FACTS)).toBe("3 changes applied");
    expect(stageHint("validate", activity("changed", 1), FACTS)).toBe("1 warning");
    expect(stageHint("validate", activity("error", 2), FACTS)).toBe("2 errors reported");
    expect(stageHint("parse", activity("error"), FACTS)).toBe("this stage failed");
  });

  it("says what a quiet stage did too", () => {
    expect(stageHint("global", activity("skipped"), FACTS)).toBe("skipped in this run");
    expect(stageHint("migrate", activity("clean"), FACTS)).toBe("nothing to migrate");
    expect(stageHint("massage", activity("clean"), FACTS)).toBe("left the config unchanged");
    expect(stageHint("validate", activity("clean"), FACTS)).toBe("no warnings");
    expect(stageHint("parse", activity("clean"), FACTS)).toBe("ran without incident");
  });

  it("quotes the run's counts for the two stages that have one", () => {
    expect(stageHint("preset", activity("clean"), { ...FACTS, presetCount: 1 })).toBe(
      "1 preset resolved",
    );
    expect(stageHint("preset", activity("clean"), FACTS)).toBe("no presets to resolve");
    expect(stageHint("merge", activity("clean"), { ...FACTS, effectiveKeys: 62 })).toBe(
      "62 options in the effective config",
    );
    // Still pending: the card says what it knows instead of a wrong number.
    expect(stageHint("merge", activity("clean"), FACTS)).toBe("ran without incident");
  });
});
