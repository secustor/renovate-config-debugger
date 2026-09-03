import { describe, expect, test } from "vitest";
import { fixture, runCli, runJson } from "../../test/harness";

describe("run", () => {
  test("without --select the trace is the small selection, not the firehose", async () => {
    const run = await runJson<Record<string, unknown>>([
      "run",
      fixture("clean.json"),
      "--format",
      "json",
    ]);
    expect(run.code).toBe(0);
    const result = run.payload;
    expect(Object.keys(result)).toEqual([
      "renovateVersion",
      "stageStatus",
      "errors",
      "warnings",
      "finalConfig",
    ]);
  });

  test("--select trims the trace to the named slices", async () => {
    const run = await runJson<Record<string, unknown>>([
      "run",
      fixture("clean.json"),
      "--format",
      "json",
      "--select",
      "status",
    ]);
    expect(run.code).toBe(0);
    const result = run.payload;
    expect(Object.keys(result)).toEqual(["renovateVersion", "stageStatus"]);
  });

  test("an unknown slice is rejected", async () => {
    const run = await runCli(["run", fixture("clean.json"), "--select", "everything"]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("--select");
  });

  test("a slice the run has no data for prints null, not a blank line", async () => {
    const run = await runCli(["run", fixture("clean.json"), "--select", "layers"]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("Layers:\nnull");
  });

  test("reads the config from stdin", async () => {
    const run = await runJson<{ finalConfig: { labels: string[] } }>(
      ["run", "--stdin", "--format", "json", "--select", "final"],
      { stdin: '{"labels":["from-stdin"]}' },
    );
    expect(run.code).toBe(0);
    const result = run.payload;
    expect(result.finalConfig.labels).toEqual(["from-stdin"]);
  });
});
