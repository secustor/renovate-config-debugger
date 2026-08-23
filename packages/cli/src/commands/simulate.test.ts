import { describe, expect, test } from "vitest";
import { fixture, runCli, runJson } from "../test-harness";

describe("simulate", () => {
  test("reports a verdict per rule with clause-level evidence", async () => {
    const run = await runJson<{
      dep: { updateType?: string };
      rules: { verdict: string; clauses: { key: string; state: string }[] }[];
    }>([
      "simulate",
      fixture("grouped.json"),
      "--dep",
      '{"depName":"react","packageName":"react","currentValue":"17.0.0","newValue":"18.0.0"}',
      "--format",
      "json",
    ]);
    expect(run.code).toBe(0);
    const sim = run.payload;
    // updateType was not given, so it was derived from the version pair.
    expect(sim.dep.updateType).toBe("major");
    expect(sim.rules[0]?.verdict).toBe("matched");
    expect(sim.rules[0]?.clauses[0]).toMatchObject({ key: "matchPackageNames", state: "matched" });
  });

  test("a dependency no rule matches is a verdict, not an error", async () => {
    const run = await runJson<{
      rules: { verdict: string; clauses: { key: string; state: string }[]; merged?: unknown }[];
    }>([
      "simulate",
      fixture("grouped.json"),
      "--dep",
      '{"depName":"lodash","packageName":"lodash","currentValue":"4.17.20","newValue":"4.17.21"}',
      "--format",
      "json",
      // Roadmap 073: the default answer is the rules that ACTED, so a
      // genuine mismatch is one facet away.
      "--verdict",
      "all",
    ]);
    expect(run.code).toBe(0);
    const sim = run.payload;
    expect(sim.rules[0]?.verdict).toBe("no-match");
    expect(sim.rules[0]?.clauses[0]).toMatchObject({
      key: "matchPackageNames",
      state: "no-match",
    });
    // Nothing matched, so nothing was merged for this dependency.
    expect(sim.rules[0]?.merged).toBeUndefined();
  });

  test("a dependency is required", async () => {
    const run = await runCli(["simulate", fixture("grouped.json")]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("--dep");
  });
});

/**
 * Roadmap 070: `--format json` used to spread the whole `SimulationResult` —
 * 106 kB for this fixture, 74% of it the merge trace nobody asked for, and a
 * `finalDependencyConfig` carrying 107 globalOnly options no packageRule can
 * read. It now answers at the same `detail` the MCP `simulate` tool does,
 * through the same projection.
 */
function simulateJson(...flags: string[]) {
  return runJson<Record<string, unknown>>([
    "simulate",
    fixture("described.json"),
    "--dep",
    '{"depName":"react"}',
    "--format",
    "json",
    ...flags,
  ]);
}

describe("simulate --detail / --keys / --config-scope", () => {
  test("the default json answer is the verdict, not the merge trace", async () => {
    const { payload, code } = await simulateJson();
    expect(code).toBe(0);
    expect(payload).not.toHaveProperty("mergeSteps");
    expect(payload).not.toHaveProperty("rawFinalConfig");
    // The omission is stated, with the flag that undoes it.
    expect((payload.notes as string[]).join(" ")).toContain('detail: "full"');
    expect(payload.rules).toBeDefined();
    expect(payload.flattened).toBeDefined();
  });

  test("--detail full restores the whole result, byte for byte", async () => {
    const { payload } = await simulateJson("--detail", "full");
    expect(payload.mergeSteps).toBeDefined();
    expect(payload.rawFinalConfig).toBeDefined();
    expect((payload.notes as string[]).join(" ")).not.toContain('detail: "full"');
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
    const run = await runCli([
      "simulate",
      fixture("described.json"),
      "--dep",
      '{"depName":"react"}',
      "--config-scope",
      "global",
    ]);
    const code = run.code;
    expect(code).toBe(1);
    expect(run.stderr).toContain("package-rules|full");
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
    const run = await runCli([
      "simulate",
      fixture("described.json"),
      "--dep",
      '{"depName":"react"}',
    ]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain(
      'sets description += 1 of 3 entries: ["Group the react packages into one PR."]',
    );
    expect(run.stdout).not.toContain("The base config for this repository.");
  });
});

describe("simulate errors", () => {
  test("a dependency is required", async () => {
    const run = await runCli(["simulate", fixture("grouped.json")]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("--dep");
  });
});

/**
 * Roadmap 062, top friction of the 2026-07 persona study (6 of 9 sessions): a
 * ~713-rule dump with no way to scope it. `mixed-rules.json` is one rule of
 * each kind against `react` — a preset rule that fails on an unset depType, a
 * matching one, one that fails on an unset sourceUrl, and a genuine mismatch.
 */
/** The rule numbers a pretty verdict list actually printed. Zero-based merged
 *  indexes since replay-03 — the same numbers `--rule` and JSON's `index`
 *  take, where the old one-based `#N+1` cost two expert sessions a wasted
 *  `--rule` call each. */
function shown(run: { stdout: string }): number[] {
  return [...run.stdout.matchAll(/^ {2}#(\d+) /gm)].map((m) => Number(m[1]));
}

function simulateMixed(...flags: string[]) {
  return runCli([
    "simulate",
    fixture("mixed-rules.json"),
    "--dep",
    '{"depName":"react"}',
    ...flags,
  ]);
}

describe("simulate --verdict / --source", () => {
  const simulate = simulateMixed;

  test("pretty output defaults to the notable rules and says what it hid", async () => {
    const run = await simulate();
    expect(run.code).toBe(0);
    expect(shown(run)).toEqual([1]);
    expect(run.stdout).toContain(
      "3 of 4 rules hidden by --verdict notable — `--verdict all --source all` shows every rule.",
    );
  });

  test("--verdict all prints every rule and hides nothing", async () => {
    const run = await simulate("--verdict", "all");
    expect(shown(run)).toEqual([0, 1, 2, 3]);
    expect(run.stdout).not.toContain("hidden by");
  });

  test("the verdict facets split no-input from a genuine mismatch", async () => {
    expect(shown(await simulate("--verdict", "matched"))).toEqual([1]);
    expect(shown(await simulate("--verdict", "no-input"))).toEqual([0, 2]);
    expect(shown(await simulate("--verdict", "no-match"))).toEqual([3]);
  });

  test("--source separates the repo's own rules from what a preset brought in", async () => {
    expect(shown(await simulate("--verdict", "all", "--source", "repo"))).toEqual([1, 2, 3]);
    expect(shown(await simulate("--verdict", "all", "--source", "presets"))).toEqual([0]);
  });

  /** The printed number and the flag agree: `#N` in the prose is the row
   *  `--rule N` returns. */
  test("the pretty rule number is the index --rule takes", async () => {
    const notable = await simulate();
    const [printed] = shown(notable);
    expect(printed).toBe(1);
    expect(notable.stdout).toContain("`--rule <n>` takes them verbatim");
    const one = await simulate("--rule", String(printed), "--format", "json");
    const report = one.json() as { rules: { index: number; verdict: string }[] };
    expect(report.rules).toHaveLength(1);
    expect(report.rules[0]).toMatchObject({ index: printed, verdict: "matched" });
  });

  test("an unknown value names the ones that exist", async () => {
    const run = await simulate("--verdict", "nope");
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("notable|all|matched|no-input|no-match");
  });

  /**
   * Roadmap 073, the flip. `--format json` used to answer with the whole array
   * "for scripts", which on a `config:recommended` run is 340 kB the MCP
   * transport then cut to a byte-arithmetic window anyway. Both formats now
   * answer with the rules that acted, and `matched ⊂ notable` keeps the common
   * `jq '.rules[] | select(.verdict=="matched")'` pipeline returning the same
   * rows. What is new is that the payload SAYS what it withheld.
   */
  test("--format json answers with the notable rules and states what it withheld", async () => {
    const run = await simulate("--format", "json");
    const sim = run.json() as {
      rules: { verdict: string }[];
      ruleFilter: Record<string, unknown>;
      notes: string[];
    };
    expect(sim.rules.map((rule) => rule.verdict)).toEqual(["matched"]);
    expect(sim.ruleFilter).toEqual({
      verdict: "notable",
      source: "all",
      total: 4,
      shown: 1,
      hidden: 3,
    });
    const note = sim.notes.join(" ");
    expect(note).toContain("1 of 4 rules");
    expect(note).toContain("`--verdict all` returns every row");
    expect(note).toContain("`--rule N`");
  });

  test("--verdict all is the way back, and it says nothing was withheld", async () => {
    const run = await simulate("--format", "json", "--verdict", "all");
    const sim = run.json() as { rules: unknown[]; ruleFilter: { hidden: number } };
    expect(sim.rules).toHaveLength(4);
    expect(sim.ruleFilter.hidden).toBe(0);
  });

  /**
   * Roadmap 073's drill-down, and the round-trip that pins it: `--rule N`
   * returns the row `--verdict all` shows at index N — including the rows every
   * facet hides, which is the only reason to ask.
   */
  test("--rule returns one row by index, the same row --verdict all holds there", async () => {
    const all = (await simulate("--format", "json", "--verdict", "all")).json() as {
      rules: Record<string, unknown>[];
    };
    for (const index of [0, 2, 3]) {
      const one = (await simulate("--format", "json", "--rule", String(index))).json() as {
        rules: Record<string, unknown>[];
        ruleFilter: Record<string, unknown>;
      };
      expect(one.rules).toHaveLength(1);
      // The origin rides along on a row that did NOT match, too: the list omits
      // it to save 15 % of the payload, one row cannot afford to.
      const { origin: _origin, ...row } = one.rules[0] ?? {};
      expect(row).toEqual(all.rules[index]);
      expect(one.ruleFilter).toMatchObject({ rule: index, shown: 1, hidden: 3 });
    }
  });

  test("--rule out of range names the total", async () => {
    const run = await simulate("--rule", "9");
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("evaluated 4 merged packageRules; there is no rule 9");
  });

  /**
   * The regression: two of these four rules lose to an unset field, both report
   * a plain `no-match`, and every scoped view hides them — so the default
   * output said "1 of 4 matched" and left the reader to conclude the config
   * does not do what it plainly does.
   */
  test("the rules an unset field cost are named even when their rows are hidden", async () => {
    const run = await simulate();
    expect(shown(run)).toEqual([1]);
    expect(run.stdout).toContain("2 of 4 rules could not match");
    expect(run.stdout).toContain("sourceUrl");
    expect(run.stdout).toContain("`--verdict no-input` lists them.");
  });

  test("the same line survives --verdict matched, and --verdict all where nothing is hidden", async () => {
    const matched = await simulate("--verdict", "matched");
    expect(shown(matched)).toEqual([1]);
    expect(matched.stdout).toContain("2 of 4 rules could not match");

    const all = await simulate("--verdict", "all");
    expect(all.stdout).not.toContain("hidden by");
    expect(all.stdout).toContain("2 of 4 rules could not match");
  });

  test("json carries the summary whatever the filter, and it counts the no-input rows", async () => {
    const run = await simulate("--format", "json", "--verdict", "matched");
    const sim = run.json() as {
      rules: unknown[];
      missingInputs: { rules: number; groups: { fieldList: string; rules: number }[] };
      notes: string[];
    };
    expect(sim.rules).toHaveLength(1);
    // The parity property: the number in the summary is the number of rows
    // `--verdict no-input` prints.
    expect(sim.missingInputs.rules).toBe(shown(await simulate("--verdict", "no-input")).length);
    expect(sim.missingInputs.rules).toBe(2);
    expect(sim.missingInputs.groups.map((group) => group.fieldList)).toEqual([
      "depType or depTypes",
      "sourceUrl",
    ]);
    expect(sim.notes.join(" ")).toContain("`--verdict no-input` lists them.");
  });

  test("a filtered json payload states what it left out", async () => {
    const run = await simulate("--format", "json", "--verdict", "matched");
    const sim = run.json() as { rules: unknown[]; ruleFilter: Record<string, unknown> };
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
    const run = await runJson<{
      rules: { verdict: string; clauses: { key: string; state: string }[] }[];
      notes: string[];
    }>(["simulate", fixture("grouped.json"), "--dep", '{"depName":"react"}', "--format", "json"]);
    expect(run.code).toBe(0);
    const sim = run.payload;
    expect(sim.rules[0]?.verdict).toBe("matched");
    expect(sim.rules[0]?.clauses[0]).toMatchObject({ key: "matchPackageNames", state: "matched" });
    expect(sim.notes).toContainEqual(expect.stringContaining("packageName defaulted from depName"));
  });

  test("an explicit packageName is never overwritten", async () => {
    const run = await runJson<{ rules: { verdict: string }[]; notes: string[] }>([
      "simulate",
      fixture("grouped.json"),
      "--dep",
      '{"depName":"react","packageName":"lodash"}',
      "--format",
      "json",
      "--verdict",
      "all",
    ]);
    const sim = run.payload;
    expect(sim.rules[0]?.verdict).toBe("no-match");
    expect(sim.notes.join(" ")).not.toContain("packageName defaulted");
  });
});

/** Roadmap 062 (2 of 9 sessions): exit 2 came from the INPUT config, with
 *  nothing in the output to say so. */
describe("simulate on a config Renovate would refuse", () => {
  test("exit 2 is explained on the same output", async () => {
    const run = await runCli(["simulate", fixture("invalid.json"), "--dep", '{"depName":"react"}']);
    expect(run.code).toBe(2);
    expect(run.stdout).toContain("exit code 2 reflects that, not this command's answer");
  });

  test("json carries the same fact as a field", async () => {
    const run = await runJson<{ wouldRefuse: boolean; exitNote: string }>([
      "simulate",
      fixture("invalid.json"),
      "--dep",
      '{"depName":"react"}',
      "--format",
      "json",
    ]);
    const sim = run.payload;
    expect(sim.wouldRefuse).toBe(true);
    expect(sim.exitNote).toContain("would be refused by Renovate");
  });
});

/**
 * Roadmap 048. The answer used to be assemble-it-yourself: rule rows, a
 * per-dependency config, and a `flattened` object whose empty `merged` meant
 * either "no block for this update type" or "the block was there and changed
 * nothing". `automerge-minor.json` puts one authored `minor` block in front of
 * both readings.
 */
function simulateAutomerge(newValue: string, ...flags: string[]) {
  return runCli([
    "simulate",
    fixture("automerge-minor.json"),
    "--dep",
    `{"depName":"react","currentValue":"17.0.0","newValue":"${newValue}"}`,
    ...flags,
  ]);
}

interface VerdictJson {
  verdict: { text: string; changedKeys: string[]; caveat?: string };
  flattened: {
    appliedBlock: { key: string; keys: string[]; authored: boolean; changed: string[] } | null;
    consumedBlocks: { key: string; keys: string[]; layer: string | null }[];
    note: string;
  };
}

describe("simulate answers in one sentence", () => {
  test("the block that merged up is named, and so is what it set", async () => {
    const run = await simulateAutomerge("17.1.0", "--format", "json");
    expect(run.code).toBe(0);
    const payload = run.json() as VerdictJson;
    expect(payload.verdict.text).toBe(
      'This minor update WOULD automerge, get labels [deps], and be grouped as "react monorepo".',
    );
    expect(payload.verdict.changedKeys).toContain("automerge");
    expect(payload.flattened.appliedBlock).toEqual({
      key: "minor",
      keys: ["automerge"],
      authored: true,
      changed: ["automerge"],
    });
    expect(payload.flattened.note).toBe("the `minor` block merged up and set: `automerge`");
  });

  /** The disambiguation: `merged` is empty for a major update, and used to be
   *  the whole story. The block exists — it is Renovate's own — and the
   *  authored `minor` block is the one that was dropped without applying. */
  test("an empty merge says WHICH empty it was", async () => {
    const run = await simulateAutomerge("18.0.0", "--format", "json");
    const payload = run.json() as VerdictJson;
    expect(payload.verdict.text).toContain("WOULD NOT automerge");
    expect(payload.verdict.text).toContain("only for minor updates");
    expect(payload.flattened.appliedBlock).toMatchObject({
      key: "major",
      authored: false,
      changed: [],
    });
    expect(payload.flattened.note).toContain("changed nothing");
    expect(payload.flattened.note).toContain("Renovate's own default block");
    expect(payload.flattened.consumedBlocks).toEqual([
      { key: "minor", keys: ["automerge"], layer: null },
    ]);
  });

  test("pretty output leads with the sentence, and states the flattening", async () => {
    const run = await simulateAutomerge("18.0.0");
    expect(run.stdout.split("\n")[0]).toBe(
      'This major update WOULD get labels [deps] and be grouped as "react monorepo", ' +
        "but WOULD NOT automerge (your config enables automerge only for minor updates).",
    );
    expect(run.stdout).toContain(
      "Update-type flattening: the `major` block was flattened and changed nothing",
    );
  });

  /** `full` is the level a caller reaches for when the projection got in the
   *  way — it must not be the level that loses the answer. */
  test("--detail full keeps the sentence", async () => {
    const run = await simulateAutomerge("17.1.0", "--format", "json", "--detail", "full");
    const payload = run.json() as VerdictJson & { mergeSteps: unknown[] };
    expect(payload.mergeSteps.length).toBeGreaterThan(0);
    expect(payload.verdict.text).toContain("WOULD automerge");
    expect(payload.flattened.note).toContain("merged up and set");
  });
});

/**
 * Roadmap 073's blocker, end to end. `conda` versioning is the documented
 * honest-error case: its parser is a ~3 MB WASM module the browser build
 * excludes, so `matchCurrentVersion` THROWS and the simulator records a clause
 * error — while upstream treats a throwing matcher as a non-match, which put
 * the rule in the one bucket the old `notable` filter dropped. "The tool could
 * not evaluate this rule" is the last thing that may go missing, so the
 * conclusion-preserving gate is asserted on the default answer.
 */
function simulateConda(...flags: string[]) {
  return runCli([
    "simulate",
    fixture("conda-version.json"),
    "--dep",
    '{"depName":"react","versioning":"conda","currentValue":"1.2.3"}',
    ...flags,
  ]);
}

describe("simulate on a rule the tool cannot evaluate", () => {
  test("the default answer keeps the error row AND counts it", async () => {
    const run = await simulateConda("--format", "json");
    expect(run.code).toBe(0);
    const sim = run.json() as {
      rules: { index: number; verdict: string; clauses: { state: string; note?: string }[] }[];
      evaluationErrors: {
        rules: number;
        selectors: string[];
        messages: string[];
        sampleRuleIndexes: number[];
        note: string;
      };
      ruleFilter: { verdict: string; hidden: number };
      notes: string[];
    };
    // The default is `notable`, and the error row is in it — its verdict is a
    // plain `no-match`, so only the clause predicate can keep it.
    expect(sim.ruleFilter.verdict).toBe("notable");
    const errored = sim.rules.find((rule) => rule.index === 0);
    expect(errored?.verdict).toBe("no-match");
    expect(errored?.clauses[0]?.state).toBe("error");
    expect(errored?.clauses[0]?.note).toContain("conda versioning is not supported");
    // …and the aggregate says it whatever the filter, in the array that cannot
    // be filtered away.
    expect(sim.evaluationErrors).toMatchObject({
      rules: 1,
      selectors: ["matchCurrentVersion"],
      sampleRuleIndexes: [0],
    });
    expect(sim.notes.join(" ")).toContain("could not be EVALUATED");
    expect(sim.notes.join(" ")).toContain("`--verdict error` lists them.");
  });

  test("--verdict error is the facet that names them, --verdict no-match is not", async () => {
    const onlyErrors = (await simulateConda("--format", "json", "--verdict", "error")).json() as {
      rules: { index: number }[];
    };
    expect(onlyErrors.rules.map((rule) => rule.index)).toEqual([0]);
    // A GENUINE mismatch is a different question, and now a different facet:
    // rule 1 matched, rule 0 could not be evaluated, so neither is one.
    const mismatches = (
      await simulateConda("--format", "json", "--verdict", "no-match")
    ).json() as { rules: unknown[] };
    expect(mismatches.rules).toEqual([]);
  });

  test("pretty output states it too, whatever the view hid", async () => {
    const run = await simulateConda();
    expect(run.stdout).toContain("could not be EVALUATED");
    expect(run.stdout).toContain("may not reflect a real Renovate run");
  });
});
