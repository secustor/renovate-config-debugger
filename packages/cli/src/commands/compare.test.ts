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
      verdict: string;
      startedMatching: { label: string }[];
      configDelta: { key: string }[];
      configView: { scope: string };
    };
    expect(comparison.verdict).toBe("differs");
    expect(comparison.startedMatching[0]?.label).toBe("matchPackageNames");
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
    expect(io.json()).toMatchObject({ verdict: "identical" });
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
    // `description` is prose, so it is filed behind the behavioral keys rather
    // than headlining them by alphabetical accident.
    expect(io.stdout.split("\n")[0]).toBe(
      "Behavior differs between A and B — dependencyDashboard (A=true by default, B=false by " +
        'default), groupName (A=null by default, B="react monorepo"); description also changed ' +
        "(documentation); 1 rule started matching.",
    );
    expect(io.stdout).toContain("Matched only in B:");
    expect(io.stdout).toContain("groupName");
  });

  /** Replay-02 N8, on the CLI side: a value NO merge step wrote is a Renovate
   *  default, and printing it bare asserts a setting the config never carried. */
  test("the delta marks a side the config never set as a default", async () => {
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
    expect(io.stdout).toContain('groupName: null (default in A) → "react monorepo"');
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
    expect(summary).toBe(
      "differs: dependencyDashboard (A=true by default, B=false by default), groupName " +
        '(A=null by default, B="react monorepo"); description also changed (documentation); ' +
        "1 rule started matching",
    );
    expect(io.stdout).toContain("summary");
    // Roadmap 070: the summary is built from the delta's KEYS, and collapsing
    // a value is only safe because it never moves one. Pinned explicitly —
    // behavioral keys first, alphabetical within group, so the array reads in
    // the order the summary names it.
    expect(configDelta.map((d) => d.key)).toEqual([
      "dependencyDashboard",
      "groupName",
      "description",
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

  /**
   * The trap this closes: two sides that BOTH failed to evaluate the same rule
   * for lack of dependency input agree perfectly, and `identical:` over two
   * blind runs reads as "the edit does nothing".
   */
  test("a side that could not evaluate a rule says so, on both sides", async () => {
    const args = [
      "compare",
      fixture("mixed-rules.json"),
      fixture("mixed-rules.json"),
      "--dep",
      '{"depName":"react"}',
    ];
    const io = recordingIo();
    expect(await main(args, io)).toBe(0);
    expect(io.stdout).toContain("✓ No behavioral change");
    expect(io.stdout).toContain("A — 2 of 4 rules could not match");
    expect(io.stdout).toContain("B — 2 of 4 rules could not match");
    expect(io.stdout).toContain("`--verdict no-input` lists them.");

    const json = recordingIo();
    expect(await main([...args, "--format", "json"], json)).toBe(0);
    const comparison = json.json() as {
      a: { missingInputs: { rules: number; groups: { fieldList: string }[] } };
      b: { missingInputs: { rules: number } };
      verdict: string;
    };
    expect(comparison.verdict).toBe("identical");
    expect(comparison.a.missingInputs.rules).toBe(2);
    expect(comparison.b.missingInputs.rules).toBe(2);
    expect(comparison.a.missingInputs.groups.map((group) => group.fieldList)).toEqual([
      "depType or depTypes",
      "sourceUrl",
    ]);
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
          "groupName,onboardingConfig,labels",
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
    expect(comparison.summary).toBe(
      "differs: dependencyDashboard (A=true by default, B=false by default), groupName " +
        '(A=null by default, B="react monorepo"); description also changed (documentation); ' +
        "1 rule started matching",
    );
    // The reason a caller can act on: `--config-scope full` is what would
    // make a globalOnly name answerable, whether or not the delta held it —
    // and `labels`, identical on both sides, is `identical`, not `absent`
    // (replay-03: "absent" read as "not in the config" about a key both
    // configs hold).
    expect(comparison.configView.withheld).toEqual([
      { key: "onboardingConfig", reason: "global-only" },
      { key: "labels", reason: "identical" },
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

interface Comparison {
  verdict: string;
  matchedInBoth?: unknown[];
  notes?: string[];
  configDelta: unknown[];
  stoppedMatching: unknown[];
  startedMatching: unknown[];
  identity: {
    changed: boolean;
    counts?: { onlyInA: number; onlyInB: number; signatureChanges: number };
    onlyInA: unknown[];
    signatureChanges: { a: { label: string }; kind: string; keys: string[] }[];
  };
}

describe("compare separates behavior from rule identity", () => {
  const args = narrowingArgs;

  test("narrowing the matched array around the dependency is no behavioral change", async () => {
    const io = recordingIo();
    // Roadmap 073: the identity ARRAYS are one detail level down — the default
    // answer states the churn as counts (asserted below).
    expect(await main(args("--format", "json", "--detail", "rules"), io)).toBe(0);
    const comparison = io.json() as Comparison;
    expect(comparison.verdict).toBe("identical");
    expect(comparison.configDelta).toEqual([]);
    expect(comparison.stoppedMatching).toEqual([]);
    expect(comparison.startedMatching).toEqual([]);
    // The identity axis still reports the churn, on its own fields — nested,
    // so `identity.onlyInA` cannot be misread as "stopped matching".
    expect(comparison.identity.changed).toBe(true);
    expect(comparison.identity.onlyInA).toHaveLength(1);
    expect(comparison.identity.signatureChanges).toHaveLength(1);
    expect(comparison.identity.signatureChanges[0]?.a.label).toBe("matchPackageNames");
    expect(comparison.identity.signatureChanges[0]?.kind).toBe("clause-values-changed");
  });

  test("pretty output headlines on behavior and files the churn underneath", async () => {
    const io = recordingIo();
    expect(await main(args(), io)).toBe(0);
    expect(io.stdout.split("\n")[0]).toContain("✓ No behavioral change");
    expect(io.stdout).toContain("a rule's matchPackageNames list changed");
    // Roadmap 073: at the default detail the churn is a count plus the flag
    // that lists it; the list itself is `--detail rules`.
    expect(io.stdout).toContain(
      "Selector text changed on 1 rule, same effect (rule identity, not behavior) — " +
        "`--detail rules` lists them.",
    );

    const listed = recordingIo();
    expect(await main(args("--detail", "rules"), listed)).toBe(0);
    expect(listed.stdout).toContain(
      "Selector text changed, same effect (rule identity, not behavior)",
    );
  });

  /**
   * The parenthetical used to be one hardcoded sentence, "a rule's pattern
   * text changed", fired for every behavior-preserving edit — factually wrong
   * for the ones that ADD a clause, and untested until now.
   */
  test("an added clause is named as an addition, not as a pattern rewrite", async () => {
    const added = [
      "compare",
      fixture("narrow-before.json"),
      fixture("clause-added-after.json"),
      "--dep",
      '{"depName":"react","updateType":"minor"}',
    ];
    const io = recordingIo();
    expect(await main(added, io)).toBe(0);
    expect(io.stdout).toContain("a rule gained a matchUpdateTypes clause");
    expect(io.stdout).not.toContain("pattern text changed");

    const json = recordingIo();
    expect(await main([...added, "--format", "json", "--detail", "rules"], json)).toBe(0);
    const comparison = json.json() as Comparison;
    expect(comparison.verdict).toBe("identical");
    expect(comparison.identity.signatureChanges[0]?.kind).toBe("clause-added");
    expect(comparison.identity.signatureChanges[0]?.keys).toEqual(["matchUpdateTypes"]);
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

/**
 * Roadmap 073: `--detail` on the comparison, same vocabulary as the MCP tool's.
 * The default is the claim plus its evidence; what it withholds is the
 * bookkeeping — and it says which level returns it.
 */
describe("compare --detail", () => {
  async function comparisonAt(...extra: string[]): Promise<Comparison> {
    const io = recordingIo();
    expect(await main(narrowingArgs("--format", "json", ...extra), io)).toBe(0);
    return io.json() as Comparison;
  }

  test("the default answers with counts, and names the level that lists them", async () => {
    const payload = await comparisonAt();
    expect(payload.matchedInBoth).toBeUndefined();
    expect(payload.identity).toEqual({
      changed: true,
      counts: { onlyInA: 1, onlyInB: 1, signatureChanges: 1 },
    });
    expect(payload.notes?.join(" ")).toContain("`--detail rules`");
    // No selector signature at this level — it is a whole matched array,
    // restated as a string next to the `label` that already names the rule.
    expect(JSON.stringify(payload)).not.toContain('"signature":');
  });

  test("--detail rules restores the arrays, --detail full the signatures", async () => {
    const rules = await comparisonAt("--detail", "rules");
    expect(rules.matchedInBoth).toBeDefined();
    expect(rules.identity.signatureChanges).toHaveLength(1);
    expect(JSON.stringify(rules)).not.toContain('"signature":');

    const full = await comparisonAt("--detail", "full");
    expect(JSON.stringify(full)).toContain('"signature":');
    expect(full.notes?.join(" ") ?? "").not.toContain("--detail");
  });

  test("an unknown value names the ones that exist", async () => {
    const io = recordingIo();
    expect(await main(narrowingArgs("--detail", "nope"), io)).toBe(1);
    expect(io.stderr).toContain("verdict|rules|full");
  });
});
