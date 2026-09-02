import { describe, expect, test } from "vitest";
import { fixture, runCli, runJson } from "../../test/harness";

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
    const run = await runJson<{
      verdict: string;
      startedMatching: { label: string }[];
      configDelta: { key: string }[];
      configView: { scope: string };
    }>([
      "compare",
      fixture("clean.json"),
      fixture("grouped.json"),
      "--dep",
      '{"depName":"react","packageName":"react"}',
      "--format",
      "json",
    ]);
    expect(run.code).toBe(0);
    const comparison = run.payload;
    expect(comparison.verdict).toBe("differs");
    expect(comparison.startedMatching[0]?.label).toBe("matchPackageNames");
    expect(comparison.configDelta.map((d) => d.key)).toContain("groupName");
    // Roadmap 070: the delta is a VIEW now, and it says which one it is.
    expect(comparison.configView.scope).toBe("package-rules");
  });

  /** Two files are its whole grammar; a third was silently ignored, so the
   *  answer described a comparison the caller did not ask for. */
  test("a third config file is an error naming it", async () => {
    const run = await runCli([
      "compare",
      fixture("clean.json"),
      fixture("grouped.json"),
      fixture("invalid.json"),
      "--dep",
      '{"depName":"react"}',
    ]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("invalid.json");
  });

  test("the same config twice changes nothing", async () => {
    const run = await runCli([
      "compare",
      fixture("grouped.json"),
      fixture("grouped.json"),
      "--dep",
      '{"depName":"react","packageName":"react"}',
      "--format",
      "json",
    ]);
    expect(run.code).toBe(0);
    expect(run.json()).toMatchObject({ verdict: "identical" });
  });

  test("pretty output leads with the verdict, then the evidence", async () => {
    const run = await runCli([
      "compare",
      fixture("clean.json"),
      fixture("grouped.json"),
      "--dep",
      '{"depName":"react","packageName":"react"}',
    ]);
    expect(run.code).toBe(0);
    // The headline is the comparison's own one-liner: the verdict AND what it
    // was about, so a reader never has to assemble it from the arrays below.
    // `description` is prose, so it is filed behind the behavioral keys rather
    // than headlining them by alphabetical accident.
    expect(run.stdout.split("\n")[0]).toBe(
      "Behavior differs between A and B — dependencyDashboard (A=true by default, B=false by " +
        'default), groupName (A=null by default, B="react monorepo"); description also changed ' +
        "(documentation); 1 rule started matching.",
    );
    expect(run.stdout).toContain("Matched only in B:");
    expect(run.stdout).toContain("groupName");
  });

  /** Replay-02 N8, on the CLI side: a value NO merge step wrote is a Renovate
   *  default, and printing it bare asserts a setting the config never carried. */
  test("the delta marks a side the config never set as a default", async () => {
    const run = await runCli([
      "compare",
      fixture("clean.json"),
      fixture("grouped.json"),
      "--dep",
      '{"depName":"react","packageName":"react"}',
    ]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('groupName: null (default in A) → "react monorepo"');
  });

  test("the JSON carries the same one-liner, so no consumer re-derives it", async () => {
    const run = await runJson<{
      summary: string;
      configDelta: { key: string }[];
    }>([
      "compare",
      fixture("clean.json"),
      fixture("grouped.json"),
      "--dep",
      '{"depName":"react","packageName":"react"}',
      "--format",
      "json",
    ]);
    expect(run.code).toBe(0);
    const { summary, configDelta } = run.payload;
    expect(summary).toBe(
      "differs: dependencyDashboard (A=true by default, B=false by default), groupName " +
        '(A=null by default, B="react monorepo"); description also changed (documentation); ' +
        "1 rule started matching",
    );
    expect(run.stdout).toContain("summary");
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
    const run = await runJson<{ configDelta: Record<string, unknown>[] }>(args("--format", "json"));
    expect(run.code).toBe(0);
    const { configDelta } = run.payload;
    const description = configDelta.find((d) => d.key === "description");
    expect(description).toMatchObject({
      collapsed: "append",
      beforeLength: 2,
      afterLength: 3,
      added: ["Group the react packages into one PR."],
    });

    const pretty = await runCli(args());
    expect(pretty.code).toBe(0);
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
    const run = await runCli(args);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("✓ No behavioral change");
    expect(run.stdout).toContain("A — 2 of 4 rules could not match");
    expect(run.stdout).toContain("B — 2 of 4 rules could not match");
    expect(run.stdout).toContain("`--verdict no-input` lists them.");

    const json = await runJson<{
      a: { missingInputs: { rules: number; groups: { fieldList: string }[] } };
      b: { missingInputs: { rules: number } };
      verdict: string;
    }>([...args, "--format", "json"]);
    expect(json.code).toBe(0);
    const comparison = json.payload;
    expect(comparison.verdict).toBe("identical");
    expect(comparison.a.missingInputs.rules).toBe(2);
    expect(comparison.b.missingInputs.rules).toBe(2);
    expect(comparison.a.missingInputs.groups.map((group) => group.fieldList)).toEqual([
      "depType or depTypes",
      "sourceUrl",
    ]);
  });

  test("--keys narrows the delta without moving the verdict", async () => {
    const run = await runJson<{
      summary: string;
      configDelta: { key: string }[];
      configView: { withheld?: { key: string; reason: string }[] };
    }>([
      "compare",
      fixture("clean.json"),
      fixture("grouped.json"),
      "--dep",
      '{"depName":"react","packageName":"react"}',
      "--keys",
      "groupName,onboardingConfig,labels",
      "--format",
      "json",
    ]);
    expect(run.code).toBe(0);
    const comparison = run.payload;
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

  /** Pretty used to print no Config-delta section at all for a withheld key,
   *  so a global-only or identical key read as "nothing differed". */
  test("pretty names the withheld keys and why, not just the JSON answer", async () => {
    const run = await runCli([
      "compare",
      fixture("clean.json"),
      fixture("grouped.json"),
      "--dep",
      '{"depName":"react","packageName":"react"}',
      "--keys",
      "groupName,onboardingConfig,labels",
    ]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("onboardingConfig — global-only");
    expect(run.stdout).toContain("--config-scope full");
    expect(run.stdout).toContain("labels — identical");
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
    const run = await runJson<Comparison>(args("--format", "json", "--detail", "rules"));
    const comparison = run.payload;
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
    const run = await runCli(args());
    expect(run.code).toBe(0);
    expect(run.stdout.split("\n")[0]).toContain("✓ No behavioral change");
    expect(run.stdout).toContain("a rule's matchPackageNames list changed");
    // Roadmap 073: at the default detail the churn is a count plus the flag
    // that lists it; the list itself is `--detail rules`.
    expect(run.stdout).toContain(
      "Selector text changed on 1 rule, same effect (rule identity, not behavior) — " +
        "`--detail rules` lists them.",
    );

    const listed = await runCli(args("--detail", "rules"));
    expect(listed.code).toBe(0);
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
    const run = await runCli(added);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("a rule gained a matchUpdateTypes clause");
    expect(run.stdout).not.toContain("pattern text changed");

    const json = await runJson<Comparison>([...added, "--format", "json", "--detail", "rules"]);
    expect(json.code).toBe(0);
    const comparison = json.payload;
    expect(comparison.verdict).toBe("identical");
    expect(comparison.identity.signatureChanges[0]?.kind).toBe("clause-added");
    expect(comparison.identity.signatureChanges[0]?.keys).toEqual(["matchUpdateTypes"]);
  });
});

/** Roadmap 062 flagged the missing explanation; replay-04 (three sessions)
 *  showed the exit code itself was the problem: a proven "no behavioral
 *  change" arrived as a 2 because an INPUT config failed validation, and a
 *  script gating an edit on compare's exit code would read a safe refactor as
 *  a failure. The comparison is the answer, so a comparison that ran is a 0
 *  and the refusal stays a named fact on the output. */
describe("compare on a config Renovate would refuse", () => {
  test("exits 0 — the comparison ran — and names the refused side on the output", async () => {
    const run = await runCli([
      "compare",
      fixture("invalid.json"),
      fixture("grouped.json"),
      "--dep",
      '{"depName":"react"}',
    ]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("note: config A would be refused by Renovate");
    expect(run.stdout).toContain("the exit code reflects the comparison, not the refusal");
  });

  test("JSON still carries the per-side refusal facts", async () => {
    const run = await runJson<{
      a: { wouldRefuse: boolean };
      b: { wouldRefuse: boolean };
      exitNote: string;
    }>([
      "compare",
      fixture("invalid.json"),
      fixture("grouped.json"),
      "--dep",
      '{"depName":"react"}',
      "--format",
      "json",
    ]);
    expect(run.code).toBe(0);
    const payload = run.payload;
    expect(payload.a.wouldRefuse).toBe(true);
    expect(payload.b.wouldRefuse).toBe(false);
    expect(payload.exitNote).toContain("config A would be refused");
  });
});

/**
 * Roadmap 073: `--detail` on the comparison, same vocabulary as the MCP tool's.
 * The default is the claim plus its evidence; what it withholds is the
 * bookkeeping — and it says which level returns it.
 */
describe("compare --detail", () => {
  async function comparisonAt(...extra: string[]): Promise<Comparison> {
    const run = await runCli(narrowingArgs("--format", "json", ...extra));
    expect(run.code).toBe(0);
    return run.json() as Comparison;
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
    const run = await runCli(narrowingArgs("--detail", "nope"));
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("verdict|rules|full");
  });
});

/** A typo'd descriptor key makes both sides equally blind, and `identical`
 *  over two blind runs is not an answer about the edit — so the side notes
 *  carry each simulation's own input notes too. */
describe("compare reports what each side's descriptor left unread", () => {
  const args = ["compare", fixture("clean.json"), fixture("grouped.json"), "--dep"];

  test("json notes name the side and the ignored key", async () => {
    const run = await runJson<{ notes?: string[] }>([
      ...args,
      '{"depName":"react","updatetype":"major"}',
      "--format",
      "json",
    ]);
    expect(run.code).toBe(0);
    expect(run.payload.notes).toContainEqual(
      expect.stringContaining("A — 1 key ignored (`updatetype`)"),
    );
    expect(run.payload.notes).toContainEqual(
      expect.stringContaining("B — 1 key ignored (`updatetype`)"),
    );
  });

  test("pretty output prints it under the headline", async () => {
    const run = await runCli([...args, '{"depName":"react","updatetype":"major"}']);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("1 key ignored (`updatetype`)");
  });
});
