import { describe, expect, test } from "vitest";
import { main } from "../main";
import { fixture, recordingIo } from "../test-harness";

describe("simulate", () => {
  test("reports a verdict per rule with clause-level evidence", async () => {
    const io = recordingIo();
    expect(
      await main(
        [
          "simulate",
          fixture("grouped.json"),
          "--dep",
          '{"depName":"react","packageName":"react","currentValue":"17.0.0","newValue":"18.0.0"}',
          "--format",
          "json",
        ],
        io,
      ),
    ).toBe(0);
    const sim = io.json() as {
      dep: { updateType?: string };
      rules: { verdict: string; clauses: { key: string; state: string }[] }[];
    };
    // updateType was not given, so it was derived from the version pair.
    expect(sim.dep.updateType).toBe("major");
    expect(sim.rules[0]?.verdict).toBe("matched");
    expect(sim.rules[0]?.clauses[0]).toMatchObject({ key: "matchPackageNames", state: "matched" });
  });

  test("a dependency no rule matches is a verdict, not an error", async () => {
    const io = recordingIo();
    expect(
      await main(
        [
          "simulate",
          fixture("grouped.json"),
          "--dep",
          '{"depName":"lodash","packageName":"lodash","currentValue":"4.17.20","newValue":"4.17.21"}',
          "--format",
          "json",
        ],
        io,
      ),
    ).toBe(0);
    const sim = io.json() as {
      rules: { verdict: string; clauses: { key: string; state: string }[]; merged?: unknown }[];
    };
    expect(sim.rules[0]?.verdict).toBe("no-match");
    expect(sim.rules[0]?.clauses[0]).toMatchObject({
      key: "matchPackageNames",
      state: "no-match",
    });
    // Nothing matched, so nothing was merged for this dependency.
    expect(sim.rules[0]?.merged).toBeUndefined();
  });

  test("a dependency is required", async () => {
    const io = recordingIo();
    expect(await main(["simulate", fixture("grouped.json")], io)).toBe(1);
    expect(io.stderr).toContain("--dep");
  });
});

/**
 * Roadmap 070: `--format json` used to spread the whole `SimulationResult` —
 * 106 kB for this fixture, 74% of it the merge trace nobody asked for, and a
 * `finalDependencyConfig` carrying 107 globalOnly options no packageRule can
 * read. It now answers at the same `detail` the MCP `simulate` tool does,
 * through the same projection.
 */
async function simulateJson(...flags: string[]) {
  const io = recordingIo();
  const code = await main(
    [
      "simulate",
      fixture("described.json"),
      "--dep",
      '{"depName":"react"}',
      "--format",
      "json",
      ...flags,
    ],
    io,
  );
  return { io, code, payload: io.json() as Record<string, unknown> };
}

describe("simulate --detail / --keys / --config-scope", () => {
  test("the default json answer is the verdict, not the merge trace", async () => {
    const { payload, code } = await simulateJson();
    expect(code).toBe(0);
    expect(payload).not.toHaveProperty("mergeSteps");
    expect(payload).not.toHaveProperty("rawFinalConfig");
    // The omission is stated, with the flag that undoes it.
    expect(payload.detailNote).toContain('detail: "full"');
    expect(payload.rules).toBeDefined();
    expect(payload.flattened).toBeDefined();
  });

  test("--detail full restores the whole result, byte for byte", async () => {
    const { payload } = await simulateJson("--detail", "full");
    expect(payload.mergeSteps).toBeDefined();
    expect(payload.rawFinalConfig).toBeDefined();
    expect(payload.detailNote).toBeUndefined();
    expect(payload.configView).toBeUndefined();
    // Nothing collapsed, nothing pruned — the escape hatch is the raw shape.
    const rules = payload.rules as { merged?: { key: string }[] }[];
    expect(rules[0]?.merged?.[0]).toHaveProperty("before");
  });

  test("the per-dependency config drops the options no rule can reach", async () => {
    const { payload } = await simulateJson();
    const config = payload.finalDependencyConfig as Record<string, unknown>;
    expect(payload.configView).toMatchObject({
      scope: "package-rules",
      droppedGlobalOnly: 107,
    });
    expect(config).not.toHaveProperty("onboardingConfig");
    expect(config).toHaveProperty("groupName", "react monorepo");
  });

  test("--config-scope full puts the 107 back", async () => {
    const { payload } = await simulateJson("--config-scope", "full");
    const config = payload.finalDependencyConfig as Record<string, unknown>;
    expect(payload.configView).toMatchObject({ scope: "full" });
    expect(config).toHaveProperty("onboardingConfig");
  });

  test("--keys narrows the config and leaves the rules alone", async () => {
    const { payload } = await simulateJson("--keys", "groupName,onboardingConfig");
    expect(payload.finalDependencyConfig).toEqual({ groupName: "react monorepo" });
    // `keys` never widens: a key the scope removed comes back as a REASON.
    expect(payload.configView).toMatchObject({
      withheld: [{ key: "onboardingConfig", reason: "global-only" }],
    });
    expect(payload.rules).toHaveLength(1);
  });

  test("an unknown value names the ones that exist", async () => {
    const io = recordingIo();
    const code = await main(
      [
        "simulate",
        fixture("described.json"),
        "--dep",
        '{"depName":"react"}',
        "--config-scope",
        "global",
      ],
      io,
    );
    expect(code).toBe(1);
    expect(io.stderr).toContain("package-rules|full");
  });

  /** The measured defect: `mergeChildConfig` concatenates `description` on
   *  nearly every merge, so the array was re-embedded in full on BOTH sides of
   *  every diff that touched it. */
  test("a description append is collapsed into what it appended", async () => {
    const { payload } = await simulateJson();
    const rules = payload.rules as { merged: Record<string, unknown>[] }[];
    const description = rules[0]?.merged.find((m) => m.key === "description");
    expect(description).toEqual({
      key: "description",
      collapsed: "append",
      beforeLength: 2,
      afterLength: 3,
      added: ["Group the react packages into one PR."],
    });
    const full = await simulateJson("--detail", "full");
    const verbatim = (
      full.payload.rules as { merged: Record<string, unknown>[] }[]
    )[0]?.merged.find((m) => m.key === "description");
    expect(JSON.stringify(description).length).toBeLessThan(JSON.stringify(verbatim).length);
  });

  test("pretty output says what the rule appended, not the whole array", async () => {
    const io = recordingIo();
    expect(
      await main(["simulate", fixture("described.json"), "--dep", '{"depName":"react"}'], io),
    ).toBe(0);
    expect(io.stdout).toContain(
      'sets description += 1 of 3 entries: ["Group the react packages into one PR."]',
    );
    expect(io.stdout).not.toContain("The base config for this repository.");
  });
});

describe("simulate errors", () => {
  test("a dependency is required", async () => {
    const io = recordingIo();
    expect(await main(["simulate", fixture("grouped.json")], io)).toBe(1);
    expect(io.stderr).toContain("--dep");
  });
});

/**
 * Roadmap 062, top friction of the 2026-07 persona study (6 of 9 sessions): a
 * ~713-rule dump with no way to scope it. `mixed-rules.json` is one rule of
 * each kind against `react` — a preset rule that fails on an unset depType, a
 * matching one, one that fails on an unset sourceUrl, and a genuine mismatch.
 */
/** The rule numbers a pretty verdict list actually printed. */
function shown(io: { stdout: string }): number[] {
  return [...io.stdout.matchAll(/^ {2}#(\d+) /gm)].map((m) => Number(m[1]));
}

async function simulateMixed(...flags: string[]) {
  const io = recordingIo();
  const code = await main(
    ["simulate", fixture("mixed-rules.json"), "--dep", '{"depName":"react"}', ...flags],
    io,
  );
  return { io, code };
}

describe("simulate --verdict / --source", () => {
  const run = simulateMixed;

  test("pretty output defaults to the notable rules and says what it hid", async () => {
    const { io, code } = await run();
    expect(code).toBe(0);
    expect(shown(io)).toEqual([2]);
    expect(io.stdout).toContain(
      "3 of 4 rules hidden by --verdict notable — `--verdict all --source all` shows every rule.",
    );
  });

  test("--verdict all prints every rule and hides nothing", async () => {
    const { io } = await run("--verdict", "all");
    expect(shown(io)).toEqual([1, 2, 3, 4]);
    expect(io.stdout).not.toContain("hidden by");
  });

  test("the verdict facets split no-input from a genuine mismatch", async () => {
    expect(shown((await run("--verdict", "matched")).io)).toEqual([2]);
    expect(shown((await run("--verdict", "no-input")).io)).toEqual([1, 3]);
    expect(shown((await run("--verdict", "no-match")).io)).toEqual([4]);
  });

  test("--source separates the repo's own rules from what a preset brought in", async () => {
    expect(shown((await run("--verdict", "all", "--source", "repo")).io)).toEqual([2, 3, 4]);
    expect(shown((await run("--verdict", "all", "--source", "presets")).io)).toEqual([1]);
  });

  test("an unknown value names the ones that exist", async () => {
    const { io, code } = await run("--verdict", "nope");
    expect(code).toBe(1);
    expect(io.stderr).toContain("notable|all|matched|no-input|no-match");
  });

  test("--format json keeps the full array until a filter is asked for", async () => {
    const { io } = await run("--format", "json");
    const sim = io.json() as { rules: unknown[]; ruleFilter?: unknown };
    expect(sim.rules).toHaveLength(4);
    // Scripts already index into this array — an unflagged run must not shrink it.
    expect(sim.ruleFilter).toBeUndefined();
  });

  /**
   * The regression: two of these four rules lose to an unset field, both report
   * a plain `no-match`, and every scoped view hides them — so the default
   * output said "1 of 4 matched" and left the reader to conclude the config
   * does not do what it plainly does.
   */
  test("the rules an unset field cost are named even when their rows are hidden", async () => {
    const { io } = await run();
    expect(shown(io)).toEqual([2]);
    expect(io.stdout).toContain("2 of 4 rules could not match");
    expect(io.stdout).toContain("sourceUrl");
    expect(io.stdout).toContain("`--verdict no-input` lists them.");
  });

  test("the same line survives --verdict matched, and --verdict all where nothing is hidden", async () => {
    const matched = await run("--verdict", "matched");
    expect(shown(matched.io)).toEqual([2]);
    expect(matched.io.stdout).toContain("2 of 4 rules could not match");

    const all = await run("--verdict", "all");
    expect(all.io.stdout).not.toContain("hidden by");
    expect(all.io.stdout).toContain("2 of 4 rules could not match");
  });

  test("json carries the summary whatever the filter, and it counts the no-input rows", async () => {
    const { io } = await run("--format", "json", "--verdict", "matched");
    const sim = io.json() as {
      rules: unknown[];
      missingInputs: { rules: number; groups: { fieldList: string; rules: number }[] };
      missingInputsNote: string;
    };
    expect(sim.rules).toHaveLength(1);
    // The parity property: the number in the summary is the number of rows
    // `--verdict no-input` prints.
    expect(sim.missingInputs.rules).toBe(shown((await run("--verdict", "no-input")).io).length);
    expect(sim.missingInputs.rules).toBe(2);
    expect(sim.missingInputs.groups.map((group) => group.fieldList)).toEqual([
      "depType or depTypes",
      "sourceUrl",
    ]);
    expect(sim.missingInputsNote).toContain("`--verdict no-input` lists them.");
  });

  test("a filtered json payload states what it left out", async () => {
    const { io } = await run("--format", "json", "--verdict", "matched");
    const sim = io.json() as { rules: unknown[]; ruleFilter: Record<string, unknown> };
    expect(sim.rules).toHaveLength(1);
    expect(sim.ruleFilter).toEqual({
      verdict: "matched",
      source: "all",
      total: 4,
      shown: 1,
      hidden: 3,
    });
  });
});

/**
 * Roadmap 062 (3 of 9 sessions): `--dep '{"depName":"react"}'` used to make
 * every `matchPackageNames` clause report `no-input`, because that matcher
 * reads `packageName` only — a fact about this simulator, not about Renovate,
 * whose fetch worker fills `packageName` in first.
 */
describe("simulate --dep defaulting", () => {
  test("packageName defaults from depName, and the note says so", async () => {
    const io = recordingIo();
    expect(
      await main(
        ["simulate", fixture("grouped.json"), "--dep", '{"depName":"react"}', "--format", "json"],
        io,
      ),
    ).toBe(0);
    const sim = io.json() as {
      rules: { verdict: string; clauses: { key: string; state: string }[] }[];
      notes: string[];
    };
    expect(sim.rules[0]?.verdict).toBe("matched");
    expect(sim.rules[0]?.clauses[0]).toMatchObject({ key: "matchPackageNames", state: "matched" });
    expect(sim.notes).toContainEqual(expect.stringContaining("packageName defaulted from depName"));
  });

  test("an explicit packageName is never overwritten", async () => {
    const io = recordingIo();
    await main(
      [
        "simulate",
        fixture("grouped.json"),
        "--dep",
        '{"depName":"react","packageName":"lodash"}',
        "--format",
        "json",
      ],
      io,
    );
    const sim = io.json() as { rules: { verdict: string }[]; notes: string[] };
    expect(sim.rules[0]?.verdict).toBe("no-match");
    expect(sim.notes.join(" ")).not.toContain("packageName defaulted");
  });
});

/** Roadmap 062 (2 of 9 sessions): exit 2 came from the INPUT config, with
 *  nothing in the output to say so. */
describe("simulate on a config Renovate would refuse", () => {
  test("exit 2 is explained on the same output", async () => {
    const io = recordingIo();
    expect(
      await main(["simulate", fixture("invalid.json"), "--dep", '{"depName":"react"}'], io),
    ).toBe(2);
    expect(io.stdout).toContain("exit code 2 reflects that, not this command's answer");
  });

  test("json carries the same fact as a field", async () => {
    const io = recordingIo();
    await main(
      ["simulate", fixture("invalid.json"), "--dep", '{"depName":"react"}', "--format", "json"],
      io,
    );
    const sim = io.json() as { wouldRefuse: boolean; exitNote: string };
    expect(sim.wouldRefuse).toBe(true);
    expect(sim.exitNote).toContain("would be refused by Renovate");
  });
});
