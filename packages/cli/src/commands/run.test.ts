import { describe, expect, test } from "vitest";
import { main } from "../main";
import { fixture, recordingIo } from "../test-harness";

describe("run", () => {
  test("without --select the trace is the small selection, not the firehose", async () => {
    const io = recordingIo();
    expect(await main(["run", fixture("clean.json"), "--format", "json"], io)).toBe(0);
    const result = io.json() as Record<string, unknown>;
    expect(Object.keys(result)).toEqual([
      "renovateVersion",
      "stageStatus",
      "errors",
      "warnings",
      "finalConfig",
    ]);
  });

  test("--select trims the trace to the named slices", async () => {
    const io = recordingIo();
    expect(
      await main(["run", fixture("clean.json"), "--format", "json", "--select", "status"], io),
    ).toBe(0);
    const result = io.json() as Record<string, unknown>;
    expect(Object.keys(result)).toEqual(["renovateVersion", "stageStatus"]);
  });

  test("an unknown slice is rejected", async () => {
    const io = recordingIo();
    expect(await main(["run", fixture("clean.json"), "--select", "everything"], io)).toBe(1);
    expect(io.stderr).toContain("--select");
  });

  test("reads the config from stdin", async () => {
    const io = recordingIo({ stdin: '{"labels":["from-stdin"]}' });
    expect(await main(["run", "--stdin", "--format", "json", "--select", "final"], io)).toBe(0);
    const result = io.json() as { finalConfig: { labels: string[] } };
    expect(result.finalConfig.labels).toEqual(["from-stdin"]);
  });
});
