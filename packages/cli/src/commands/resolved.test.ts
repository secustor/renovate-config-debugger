import { describe, expect, test } from "vitest";
import { main } from "../main";
import { fixture, recordingIo } from "../test-harness";

describe("resolved", () => {
  test("keeps internal presets by default", async () => {
    const io = recordingIo();
    expect(await main(["resolved", fixture("clean.json"), "--format", "json"], io)).toBe(0);
    const output = io.json() as { mode: string; config: { extends?: string[] } };
    expect(output.mode).toBe("keep-internal");
    expect(output.config.extends).toEqual([":dependencyDashboard"]);
  });

  test("--mode full leaves no preset reference behind", async () => {
    const io = recordingIo();
    expect(
      await main(["resolved", fixture("clean.json"), "--mode", "full", "--format", "json"], io),
    ).toBe(0);
    const output = io.json() as { mode: string; config: Record<string, unknown> };
    expect(output.mode).toBe("full");
    expect(output.config.extends).toBeUndefined();
    // …because what `:dependencyDashboard` sets is now written out directly.
    expect(output.config.dependencyDashboard).toBe(true);
  });

  test("--include-defaults writes out the options nothing set", async () => {
    const io = recordingIo();
    expect(
      await main(
        [
          "resolved",
          fixture("clean.json"),
          "--mode",
          "full",
          "--include-defaults",
          "--format",
          "json",
        ],
        io,
      ),
    ).toBe(0);
    const output = io.json() as { includeDefaults: boolean; config: Record<string, unknown> };
    expect(output.includeDefaults).toBe(true);
    // Neither the fixture nor the preset mentions rangeStrategy.
    expect(output.config.rangeStrategy).toBe("auto");
    // `extends` is back only as its own default — empty, so still no reference.
    expect(output.config.extends).toEqual([]);
  });

  test("--include-defaults only makes sense fully expanded", async () => {
    const io = recordingIo();
    expect(await main(["resolved", fixture("clean.json"), "--include-defaults"], io)).toBe(1);
    expect(io.stderr).toContain("--mode full");
  });
});
