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
    // The headline is the comparison's own one-liner: the verdict AND what it
    // was about, so a reader never has to assemble it from the arrays below.
    expect(io.stdout.split("\n")[0]).toBe(
      "Behavior differs between A and B — dependencyDashboard, description, groupName.",
    );
    expect(io.stdout).toContain("Matched only in B:");
    expect(io.stdout).toContain("groupName");
  });

  test("the JSON carries the same one-liner, so no consumer re-derives it", async () => {
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
    const { summary } = io.json() as { summary: string };
    expect(summary).toBe("differs: dependencyDashboard, description, groupName");
    expect(io.stdout).toContain("summary");
  });
});

/**
 * Roadmap 062 (2 of 9 persona sessions): dropping an entry from the very array
 * a rule matches on necessarily rewrites that rule's selector signature, so the
 * old identity-based verdict headlined a provably behavior-preserving edit as
 * "Behavior differs" over an EMPTY config delta. One persona called the result
 * uncitable. The two axes are now reported separately.
 */
function narrowingArgs(...extra: string[]): string[] {
  return [
    "compare",
    fixture("narrow-before.json"),
    fixture("narrow-after.json"),
    "--dep",
    '{"depName":"react"}',
    ...extra,
  ];
}

describe("compare separates behavior from rule identity", () => {
  const args = narrowingArgs;

  test("narrowing the matched array around the dependency is no behavioral change", async () => {
    const io = recordingIo();
    expect(await main(args("--format", "json"), io)).toBe(0);
    const comparison = io.json() as {
      noChange: boolean;
      rulesChanged: boolean;
      configDelta: unknown[];
      signatureChanges: { a: { label: string }; b: { label: string } }[];
      behaviorOnlyInA: unknown[];
      behaviorOnlyInB: unknown[];
      matchedOnlyInA: unknown[];
    };
    expect(comparison.noChange).toBe(true);
    expect(comparison.configDelta).toEqual([]);
    expect(comparison.behaviorOnlyInA).toEqual([]);
    expect(comparison.behaviorOnlyInB).toEqual([]);
    // The identity axis still reports the churn, on its own fields.
    expect(comparison.rulesChanged).toBe(true);
    expect(comparison.matchedOnlyInA).toHaveLength(1);
    expect(comparison.signatureChanges).toHaveLength(1);
    expect(comparison.signatureChanges[0]?.a.label).toBe("matchPackageNames");
  });

  test("pretty output headlines on behavior and files the churn underneath", async () => {
    const io = recordingIo();
    expect(await main(args(), io)).toBe(0);
    expect(io.stdout.split("\n")[0]).toContain("✓ No behavioral change");
    expect(io.stdout).toContain("a rule's pattern text changed");
    expect(io.stdout).toContain("Selector text changed, same effect (rule identity, not behavior)");
  });
});

/** Roadmap 062 (2 of 9 sessions): exit 2 came from an INPUT config failing
 *  validation and said nothing about the comparison it accompanied. */
describe("compare on a config Renovate would refuse", () => {
  test("names which side caused the 2", async () => {
    const io = recordingIo();
    expect(
      await main(
        [
          "compare",
          fixture("invalid.json"),
          fixture("grouped.json"),
          "--dep",
          '{"depName":"react"}',
        ],
        io,
      ),
    ).toBe(2);
    expect(io.stdout).toContain("note: config A would be refused by Renovate");
    expect(io.stdout).toContain("not this command's answer");
  });
});
