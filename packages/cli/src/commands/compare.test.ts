import { describe, expect, test } from "vitest";
import { main } from "../main";
import { fixture, recordingIo } from "../test-harness";

describe("compare", () => {
  test("two configs, one dependency: the edit oracle", async () => {
    const io = recordingIo();
    expect(
      await main(
        [
          "compare",
          fixture("clean.json"),
          fixture("grouped.json"),
          "--dep",
          '{"depName":"react","packageName":"react"}',
          "--format",
          "json",
        ],
        io,
      ),
    ).toBe(0);
    const comparison = io.json() as {
      noChange: boolean;
      matchedOnlyInB: { label: string }[];
      configDelta: { key: string }[];
    };
    expect(comparison.noChange).toBe(false);
    expect(comparison.matchedOnlyInB[0]?.label).toBe("matchPackageNames");
    expect(comparison.configDelta.map((d) => d.key)).toContain("groupName");
  });

  test("the same config twice changes nothing", async () => {
    const io = recordingIo();
    expect(
      await main(
        [
          "compare",
          fixture("grouped.json"),
          fixture("grouped.json"),
          "--dep",
          '{"depName":"react","packageName":"react"}',
          "--format",
          "json",
        ],
        io,
      ),
    ).toBe(0);
    expect(io.json()).toMatchObject({ noChange: true });
  });

  test("pretty output leads with the verdict, then the evidence", async () => {
    const io = recordingIo();
    expect(
      await main(
        [
          "compare",
          fixture("clean.json"),
          fixture("grouped.json"),
          "--dep",
          '{"depName":"react","packageName":"react"}',
        ],
        io,
      ),
    ).toBe(0);
    expect(io.stdout.split("\n")[0]).toBe("Behavior differs between A and B.");
    expect(io.stdout).toContain("Matched only in B:");
    expect(io.stdout).toContain("groupName");
  });
});
