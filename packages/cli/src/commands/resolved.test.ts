import { describe, expect, test } from "vitest";
import { fixture, runCli, runJson } from "../../test/harness";

describe("resolved", () => {
  test("keeps internal presets by default", async () => {
    const run = await runJson<{ mode: string; config: { extends?: string[] } }>([
      "resolved",
      fixture("clean.json"),
      "--format",
      "json",
    ]);
    expect(run.code).toBe(0);
    const output = run.payload;
    expect(output.mode).toBe("keep-internal");
    expect(output.config.extends).toEqual([":dependencyDashboard"]);
  });

  test("--mode full leaves no preset reference behind", async () => {
    const run = await runJson<{ mode: string; config: Record<string, unknown> }>([
      "resolved",
      fixture("clean.json"),
      "--mode",
      "full",
      "--format",
      "json",
    ]);
    expect(run.code).toBe(0);
    const output = run.payload;
    expect(output.mode).toBe("full");
    expect(output.config.extends).toBeUndefined();
    // …because what `:dependencyDashboard` sets is now written out directly.
    expect(output.config.dependencyDashboard).toBe(true);
  });

  test("--include-defaults writes out the options nothing set", async () => {
    const run = await runJson<{ includeDefaults: boolean; config: Record<string, unknown> }>([
      "resolved",
      fixture("clean.json"),
      "--mode",
      "full",
      "--include-defaults",
      "--format",
      "json",
    ]);
    expect(run.code).toBe(0);
    const output = run.payload;
    expect(output.includeDefaults).toBe(true);
    // Neither the fixture nor the preset mentions rangeStrategy.
    expect(output.config.rangeStrategy).toBe("auto");
    // `extends` is back only as its own default — empty, so still no reference.
    expect(output.config.extends).toEqual([]);
  });

  test("--include-defaults only makes sense fully expanded", async () => {
    const run = await runCli(["resolved", fixture("clean.json"), "--include-defaults"]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("--mode full");
  });
});
