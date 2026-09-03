import type { StageId, TraceEvent } from "@renovate-config-debugger/engine";
import { describe, expect, it } from "vitest";
import { describeStageActivity, getStageActivity } from "./stage-activity";
import { traceResult } from "@tools/test/trace-result";

/**
 * The rail glyph's level and count. `stage-delta.test.ts` owns what a
 * `StageActivity` RENDERS as; this owns which one a run produces.
 */

let nextEventId = 0;

function event(stage: StageId, over: Partial<TraceEvent> & Pick<TraceEvent, "kind">): TraceEvent {
  nextEventId++;
  return { id: `e${nextEventId}`, stage, title: over.kind, ...over };
}

function validationMessage(
  level: "error" | "warn",
): Partial<TraceEvent> & Pick<TraceEvent, "kind"> {
  return { kind: "validation-message", level };
}

describe("getStageActivity", () => {
  it("reports a skipped stage without a count, whatever it logged", () => {
    const result = traceResult({
      events: [event("validate", validationMessage("error"))],
      stageStatus: { ...traceResult().stageStatus, validate: "skipped" },
    });

    expect(getStageActivity(result, "validate")).toEqual({ level: "skipped" });
  });

  it("counts validate's errors — the one stage where red carries a number", () => {
    const result = traceResult({
      events: [
        event("validate", validationMessage("error")),
        event("validate", validationMessage("error")),
        event("validate", validationMessage("warn")),
        event("migrate", { kind: "migration-applied" }),
      ],
      stageStatus: { ...traceResult().stageStatus, validate: "error" },
    });

    expect(getStageActivity(result, "validate")).toEqual({ level: "error", count: 2 });
  });

  it("leaves validate's count off when the failure logged no message", () => {
    const result = traceResult({
      stageStatus: { ...traceResult().stageStatus, validate: "error" },
    });

    expect(getStageActivity(result, "validate")).toEqual({ level: "error" });
  });

  it("turns validate amber on warnings alone, and green with none", () => {
    const warned = traceResult({
      events: [
        event("validate", validationMessage("warn")),
        event("validate", validationMessage("warn")),
        event("validate", { kind: "log", level: "warn" }),
      ],
    });

    expect(getStageActivity(warned, "validate")).toEqual({ level: "changed", count: 2 });
    expect(getStageActivity(traceResult(), "validate")).toEqual({ level: "clean" });
  });

  it("counts only migrate's applied migrations", () => {
    const result = traceResult({
      events: [
        event("migrate", { kind: "migration-applied" }),
        event("migrate", { kind: "stage-complete" }),
        event("massage", { kind: "migration-applied" }),
      ],
    });

    expect(getStageActivity(result, "migrate")).toEqual({ level: "changed", count: 1 });
    expect(getStageActivity(traceResult(), "migrate")).toEqual({ level: "clean" });
  });

  it("drops the count when a non-validate stage errored", () => {
    const result = traceResult({
      events: [event("migrate", { kind: "migration-applied" })],
      stageStatus: { ...traceResult().stageStatus, migrate: "error" },
    });

    expect(getStageActivity(result, "migrate")).toEqual({ level: "error" });
  });

  it("reads massage's delta from the LAST stage-complete", () => {
    const result = traceResult({
      events: [
        event("massage", { kind: "stage-complete", delta: [{ op: "add", path: "/a", value: 1 }] }),
        event("massage", {
          kind: "stage-complete",
          delta: [
            { op: "add", path: "/b", value: 1 },
            { op: "remove", path: "/c" },
          ],
        }),
      ],
    });

    expect(getStageActivity(result, "massage")).toEqual({ level: "changed", count: 2 });
    expect(getStageActivity(traceResult(), "massage")).toEqual({ level: "clean" });
  });

  it("keeps an always-transform stage green however much it logged", () => {
    const result = traceResult({
      events: [
        event("preset", { kind: "preset-resolved" }),
        event("preset", { kind: "stage-complete", delta: [{ op: "add", path: "/a", value: 1 }] }),
      ],
    });

    expect(getStageActivity(result, "preset")).toEqual({ level: "clean" });
  });
});

describe("describeStageActivity", () => {
  it("names the outcome per stage when something changed", () => {
    expect(describeStageActivity("migrate", "Migrate", { level: "changed", count: 1 })).toBe(
      "Migrate: 1 migration applied",
    );
    expect(describeStageActivity("validate", "Validate", { level: "changed", count: 2 })).toBe(
      "Validate: 2 warnings",
    );
    expect(describeStageActivity("massage", "Massage", { level: "changed", count: 3 })).toBe(
      "Massage: 3 changes",
    );
  });

  it("distinguishes a counted failure from a bare one", () => {
    expect(describeStageActivity("validate", "Validate", { level: "error", count: 2 })).toBe(
      "Validate: 2 errors",
    );
    expect(describeStageActivity("parse", "Parse", { level: "error" })).toBe("Parse: failed");
    expect(describeStageActivity("preset", "Presets", { level: "skipped" })).toBe(
      "Presets: skipped",
    );
  });

  it("says what nothing-happened means for each stage", () => {
    expect(describeStageActivity("migrate", "Migrate", { level: "clean" })).toBe(
      "Migrate: nothing to migrate",
    );
    expect(describeStageActivity("massage", "Massage", { level: "clean" })).toBe(
      "Massage: unchanged",
    );
    expect(describeStageActivity("validate", "Validate", { level: "clean" })).toBe(
      "Validate: no warnings",
    );
    expect(describeStageActivity("merge", "Merge", { level: "clean" })).toBe("Merge: ok");
  });
});
