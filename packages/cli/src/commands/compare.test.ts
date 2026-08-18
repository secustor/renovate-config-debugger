import { describe, expect, test } from "vitest";
import { main } from "../main";
import { fixture, recordingIo } from "../test-harness";

/** One config, two dependencies: only `react` picks up the rule's own
 *  description, so B's array is A's plus one sentence. */
function describedArgs(...extra: string[]): string[] {
  return [
    "compare",
    fixture("described.json"),
    "--dep",
    '{"depName":"lodash"}',
    "--dep-b",
    '{"depName":"react"}',
    ...extra,
  ];
}

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
      configView: { scope: string };
    };
    expect(comparison.noChange).toBe(false);
    expect(comparison.matchedOnlyInB[0]?.label).toBe("matchPackageNames");
    expect(comparison.configDelta.map((d) => d.key)).toContain("groupName");
    // Roadmap 070: the delta is a VIEW now, and it says which one it is.
    expect(comparison.configView.scope).toBe("package-rules");
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
    const { summary, configDelta } = io.json() as {
      summary: string;
      configDelta: { key: string }[];
    };
    expect(summary).toBe("differs: dependencyDashboard, description, groupName");
    expect(io.stdout).toContain("summary");
    // Roadmap 070: the summary is built from the delta's KEYS, and collapsing
    // a value is only safe because it never moves one. Pinned explicitly.
    expect(configDelta.map((d) => d.key)).toEqual([
      "dependencyDashboard",
      "description",
      "groupName",
    ]);
  });

  /** Roadmap 070: `description` is the array `mergeChildConfig` concatenates on
   *  nearly every merge, and the delta used to re-embed it whole on both
   *  sides. An append is now stated as what it appended. */
  test("a description append renders as what it appended", async () => {
    const args = describedArgs;
    const io = recordingIo();
    expect(await main(args("--format", "json"), io)).toBe(0);
    const { configDelta } = io.json() as { configDelta: Record<string, unknown>[] };
    const description = configDelta.find((d) => d.key === "description");
    expect(description).toMatchObject({
      collapsed: "append",
      beforeLength: 2,
      afterLength: 3,
      added: ["Group the react packages into one PR."],
    });

    const pretty = recordingIo();
    expect(await main(args(), pretty)).toBe(0);
    expect(pretty.stdout).toContain(
      'description: 2 entries + 1 appended (now 3) — ["Group the react packages into one PR."]',
    );
    expect(pretty.stdout).not.toContain("Reviewed every quarter.");
  });

  test("--keys narrows the delta without moving the verdict", async () => {
    const io = recordingIo();
    expect(
      await main(
        [
          "compare",
          fixture("clean.json"),
          fixture("grouped.json"),
          "--dep",
          '{"depName":"react","packageName":"react"}',
          "--keys",
          "groupName,onboardingConfig",
          "--format",
          "json",
        ],
        io,
      ),
    ).toBe(0);
    const comparison = io.json() as {
      summary: string;
      configDelta: { key: string }[];
      configView: { withheld?: { key: string; reason: string }[] };
    };
    expect(comparison.configDelta.map((d) => d.key)).toEqual(["groupName"]);
    // The verdict describes the whole comparison, not the view of it.
    expect(comparison.summary).toBe("differs: dependencyDashboard, description, groupName");
    // The reason a caller can act on: `--config-scope full` is what would
    // make a globalOnly name answerable, whether or not the delta held it.
    expect(comparison.configView.withheld).toEqual([
      { key: "onboardingConfig", reason: "global-only" },
    ]);
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
