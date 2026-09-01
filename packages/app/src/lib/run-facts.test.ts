import { describe, expect, it } from "vitest";
import type { TraceEvent, TraceResult } from "@renovate-config-debugger/engine";
import { buildDigestInput, deriveRunFacts, validatedConfigOf } from "./run-facts";
import type { DigestInput } from "./run-digest";
import type { EffectiveTally } from "./effective-tally";
import { traceResult } from "@tools/test/trace-result";
import { presetNode, presetRoot } from "@tools/test/preset-nodes";

/**
 * The TraceResult → numbers assembly: the CLI's `rcd digest` input and the
 * app's badge counts, which 029 requires to be one derivation rather than two.
 * Asserts the `DigestInput` shape only — `run-digest.test.ts` owns the prose.
 */

let nextEventId = 0;

function event(over: Partial<TraceEvent> & Pick<TraceEvent, "stage" | "kind">): TraceEvent {
  nextEventId++;
  return { id: `e${nextEventId}`, title: over.kind, ...over };
}

function migrationStep(key: string, newKey?: string): TraceEvent {
  return event({
    stage: "migrate",
    kind: "migration-applied",
    title: `rewrote ${key}`,
    migration: { name: key, className: "Migration", key, ...(newKey ? { newKey } : {}) },
  });
}

describe("deriveRunFacts", () => {
  it("reports an all-zero run for no result at all", () => {
    expect(deriveRunFacts(null)).toEqual({
      migrateSteps: [],
      finalMigrated: undefined,
      presetErrors: [],
      presetSummary: null,
      presetCount: 0,
      errorCount: 0,
      warningCount: 0,
    });
  });

  it("separates the migrate stage's granular steps from its final snapshot", () => {
    const step = migrationStep("packageNames", "matchPackageNames");
    const result = traceResult({
      events: [
        event({ stage: "migrate", kind: "stage-start" }),
        step,
        event({ stage: "migrate", kind: "stage-complete", after: { matchPackageNames: ["a"] } }),
      ],
    });
    const derived = deriveRunFacts(result);
    expect(derived.migrateSteps).toEqual([step]);
    expect(derived.finalMigrated).toEqual({ matchPackageNames: ["a"] });
  });

  it("counts a preset failure toward the Problems badge on top of the validator's", () => {
    const presetError = event({
      stage: "preset",
      kind: "preset-error",
      title: "Preset not found: local>acme/none",
    });
    const derived = deriveRunFacts(
      traceResult({
        events: [presetError, event({ stage: "migrate", kind: "preset-error" })],
        errors: [{ topic: "Config", message: "bad" }],
        warnings: [{ topic: "Config", message: "meh" }],
      }),
    );
    // A `preset-error` on the MIGRATE stage is a migrate event, not a preset one.
    expect(derived.presetErrors).toEqual([presetError]);
    expect(derived.errorCount).toBe(2);
    expect(derived.warningCount).toBe(1);
  });

  it("stays null-safe when the run resolved no preset tree", () => {
    const derived = deriveRunFacts(traceResult());
    expect(derived.presetSummary).toBeNull();
    expect(derived.presetCount).toBe(0);
  });

  it("counts the resolved presets when it did", () => {
    const derived = deriveRunFacts(
      traceResult({
        presetTree: presetRoot([
          presetNode("config:recommended", { input: { rangeStrategy: "b" } }),
        ]),
      }),
    );
    expect(derived.presetCount).toBe(1);
    expect(derived.presetSummary?.optionSetting).toBe(1);
  });
});

describe("validatedConfigOf", () => {
  it("returns the massage stage's snapshot — the one the messages index into", () => {
    const result = traceResult({
      events: [
        event({ stage: "migrate", kind: "stage-complete", after: { migrated: true } }),
        event({ stage: "massage", kind: "stage-complete", after: { massaged: true } }),
      ],
    });
    expect(validatedConfigOf(result)).toEqual({ massaged: true });
  });

  it("returns null when the run never reached massage", () => {
    expect(validatedConfigOf(traceResult())).toBeNull();
  });
});

function digest(result: TraceResult, effective: EffectiveTally | null = null): DigestInput {
  return buildDigestInput(result, deriveRunFacts(result), effective);
}

describe("buildDigestInput", () => {
  it("reports a parse failure as fatal, quoting the reason", () => {
    const input = digest(
      traceResult({
        stageStatus: { ...traceResult().stageStatus, parse: "error" },
        errors: [{ topic: "Config", message: "Unexpected token }" }],
      }),
    );
    expect(input.fatalParse).toBe("Unexpected token }");
    expect(input.errors).toBe(1);
  });

  it("omits fatalParse on a run that parsed", () => {
    expect(digest(traceResult()).fatalParse).toBeUndefined();
  });

  it("tracks refusal off the validate stage's status", () => {
    expect(digest(traceResult()).refused).toBe(false);
    expect(
      digest(traceResult({ stageStatus: { ...traceResult().stageStatus, validate: "error" } }))
        .refused,
    ).toBe(true);
  });

  it("quotes errors before warnings, and warnings before preset failures", () => {
    const presetError = event({ stage: "preset", kind: "preset-error", title: "Preset not found" });
    const error = { topic: "Config", message: "bad" };
    const warning = { topic: "Config", message: "meh" };
    expect(
      digest(traceResult({ errors: [error], warnings: [warning], events: [presetError] }))
        .firstProblem,
    ).toEqual({ severity: "error", topic: "Config", message: "bad" });
    expect(
      digest(traceResult({ warnings: [warning], events: [presetError] })).firstProblem,
    ).toEqual({ severity: "warning", topic: "Config", message: "meh" });
    expect(digest(traceResult({ events: [presetError] })).firstProblem).toEqual({
      severity: "error",
      topic: "Preset",
      message: "Preset not found",
    });
    expect(digest(traceResult()).firstProblem).toBeUndefined();
  });

  it("names the rewrites only while the digest would use them", () => {
    const two = traceResult({
      events: [migrationStep("packageNames", "matchPackageNames"), migrationStep("stabilityDays")],
    });
    expect(digest(two).migrations).toEqual({
      count: 2,
      labels: ["packageNames → matchPackageNames", "stabilityDays"],
    });
    const three = traceResult({
      events: [...two.events, migrationStep("upgradeInRange")],
    });
    expect(digest(three).migrations).toEqual({ count: 3, labels: [] });
  });

  it("names only the extends entries the user wrote at the top level", () => {
    const result = traceResult({
      presetTree: presetRoot([
        presetNode("config:recommended"),
        presetNode("group:allNonMajor", { nested: true }),
      ]),
    });
    expect(digest(result).presets.entries).toEqual(["config:recommended"]);
  });

  it("says it does not have the effective numbers rather than reporting zero", () => {
    expect(digest(traceResult()).effective).toEqual({ options: null, overridden: null });
    expect(digest(traceResult(), { keys: 7, overridden: 2, hiddenDefaults: 40 }).effective).toEqual(
      { options: 7, overridden: 2 },
    );
  });

  it("reports which extra layers the run merged", () => {
    expect(digest(traceResult()).layers).toEqual({ global: false, inherited: false });
    expect(
      digest(traceResult({ layerConfigs: { inheritedResolved: { labels: ["x"] } } })).layers,
    ).toEqual({ global: false, inherited: true });
  });
});
