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
      rules: { verdict: string; clauses: { key: string; state: string }[] }[];
      mergeSteps: unknown[];
    };
    expect(sim.rules[0]?.verdict).toBe("no-match");
    expect(sim.rules[0]?.clauses[0]).toMatchObject({
      key: "matchPackageNames",
      state: "no-match",
    });
    // Nothing matched, so nothing was merged for this dependency.
    expect(sim.mergeSteps).toEqual([]);
  });

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
