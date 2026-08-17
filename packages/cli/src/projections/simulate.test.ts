import { describe, expect, test } from "vitest";
import type { SimulationComparison, SimulationResult } from "@renovate-config-debugger/engine";
import { comparisonPayload, simulationPayload, VERDICT_DETAIL_NOTE } from "./simulate";

/**
 * Roadmap 070. Hand-built results, so the payload SHAPE is asserted without a
 * pipeline run — the engine's golden↔shimmed suite owns what the numbers in it
 * mean.
 */

const DESCRIPTION = ["Pin Docker digests.", "Separate major releases."];

const SIM: SimulationResult = {
  rules: [
    {
      index: 0,
      verdict: "matched",
      clauses: [],
      notes: [],
      merged: [
        { key: "groupName", after: "react monorepo" },
        { key: "description", before: DESCRIPTION, after: [...DESCRIPTION, "Group react."] },
      ],
    },
  ],
  rawFinalConfig: { groupName: "react monorepo", onboardingConfig: {} },
  finalDependencyConfig: {
    automerge: true,
    groupName: "react monorepo",
    onboardingConfig: { extends: ["config:recommended"] },
  },
  flattened: {
    merged: [{ key: "description", before: DESCRIPTION, after: [...DESCRIPTION, "From minor."] }],
    blocks: {},
    authoredBlocks: [],
  },
  missingInputs: { rules: 0, groups: [] },
  evaluationErrors: { rules: 0, selectors: [], messages: [], sampleRuleIndexes: [] },
  mergeSteps: [],
  errors: [],
  warnings: [],
  notes: [],
};

describe("simulationPayload", () => {
  /**
   * Roadmap 048 moved this assertion one notch: `full` is still the result
   * itself — every member, verbatim, nothing projected — but it is no longer
   * the identity, because `verdict` and the flattening legend ride along. That
   * is deliberate: `full` must not be the detail level that loses the sentence.
   */
  test('detail "full" is the escape hatch — the whole result, plus the verdict', () => {
    for (const options of [
      { detail: "full", scope: "package-rules" },
      { detail: "full", scope: "full", keys: ["automerge"] },
    ] as const) {
      const payload = simulationPayload(SIM, options) as Record<string, unknown>;
      // Identity, member by member and by REFERENCE — including the two the
      // default projection drops. `flattened` is the one wrapper, checked next.
      for (const [key, value] of Object.entries(SIM)) {
        if (key !== "flattened") {
          expect(payload[key], key).toBe(value);
        }
      }
      // …plus the two additions, and `verdict` first.
      expect(Object.keys(payload)[0]).toBe("verdict");
      const verdict = payload.verdict as { text: string };
      expect(verdict.text).toContain("WOULD");
      // The flattening legend is additive: same fields, same array objects.
      const flattened = payload.flattened as { merged: unknown; blocks: unknown; note: string };
      expect(flattened.merged).toBe(SIM.flattened.merged);
      expect(flattened.blocks).toBe(SIM.flattened.blocks);
      expect(flattened.note).toBeDefined();
    }
  });

  test("the default answer is exactly the listed members", () => {
    const payload = simulationPayload(SIM, { detail: "verdict", scope: "package-rules" });
    expect(Object.keys(payload)).toEqual([
      // The answer, before the evidence — and the last key an elision takes.
      "verdict",
      "rules",
      "missingInputs",
      "evaluationErrors",
      "flattened",
      "finalDependencyConfig",
      "configView",
      "errors",
      "warnings",
      // Roadmap 073: ONE notes array. `detailNote`, `missingInputsNote` and
      // `ruleSourcesNote` were four field names an agent had to learn to find
      // the same kind of sentence.
      "notes",
    ]);
    expect(payload).not.toHaveProperty("mergeSteps");
    expect(payload).not.toHaveProperty("rawFinalConfig");
    expect(payload).not.toHaveProperty("detailNote");
    expect(payload.notes).toContain(VERDICT_DETAIL_NOTE);
  });

  test("the per-dependency config is scoped, keyed, and says so", () => {
    const payload = simulationPayload(SIM, { detail: "verdict", scope: "package-rules" });
    expect(payload).toMatchObject({
      finalDependencyConfig: { automerge: true, groupName: "react monorepo" },
      configView: { scope: "package-rules", keys: 2, droppedGlobalOnly: 1 },
    });
    const keyed = simulationPayload(SIM, {
      detail: "verdict",
      scope: "package-rules",
      keys: ["automerge", "onboardingConfig"],
    });
    expect(keyed).toMatchObject({
      finalDependencyConfig: { automerge: true },
      configView: { withheld: [{ key: "onboardingConfig", reason: "global-only" }] },
    });
  });

  /** The summary is a sibling of `rules`, not a member of it, so it is carried
   *  by every default answer — including the ones whose rule list a filter or
   *  the elision is about to replace. */
  test("the missing-input summary rides along, with the transport's own pointer", () => {
    const sim: SimulationResult = {
      ...SIM,
      missingInputs: {
        rules: 1,
        groups: [
          {
            fields: ["sourceUrl"],
            fieldList: "sourceUrl",
            selectors: ["matchSourceUrls"],
            rules: 1,
            sampleRuleIndexes: [3],
          },
        ],
        note: "1 of 4 rules could not match because the simulated dependency has no sourceUrl.",
      },
    };
    const payload = simulationPayload(sim, {
      detail: "verdict",
      scope: "package-rules",
      transport: "mcp",
    });
    expect(payload.missingInputs).toBe(sim.missingInputs);
    expect(payload.notes).toContain(
      `${sim.missingInputs.note} \`verdict: "no-input"\` lists them.`,
    );
    // Nothing to point at, no sentence: the array never carries an empty one.
    const clean = simulationPayload(SIM, {
      detail: "verdict",
      scope: "package-rules",
      transport: "cli",
    });
    expect(clean.notes.some((note) => note.includes("could not match"))).toBe(false);
  });

  /**
   * Roadmap 073's second aggregate. A matcher that threw fails its rule to a
   * plain `no-match`, so this is the fact a scoped list would drop — and the
   * one that says the answer is incomplete rather than negative.
   */
  test("the evaluation-error summary rides along too, with its own pointer", () => {
    const sim: SimulationResult = {
      ...SIM,
      evaluationErrors: {
        rules: 1,
        selectors: ["matchCurrentVersion"],
        messages: ["matcher threw: conda versioning is not supported"],
        sampleRuleIndexes: [0],
        note: "1 of 1 rule could not be EVALUATED: `matchCurrentVersion` threw.",
      },
    };
    const payload = simulationPayload(sim, {
      detail: "verdict",
      scope: "package-rules",
      transport: "mcp",
    });
    expect(payload.evaluationErrors).toBe(sim.evaluationErrors);
    // Ahead of the missing-input pointer: "the tool could not evaluate this"
    // outranks "your dep left a field unset".
    expect(payload.notes[0]).toBe(`${sim.evaluationErrors.note} \`verdict: "error"\` lists them.`);
  });

  test("the merged description appends are collapsed, in the rules and in flattened", () => {
    const payload = simulationPayload(SIM, { detail: "verdict", scope: "package-rules" });
    expect(payload).toMatchObject({
      rules: [
        {
          merged: [
            { key: "groupName", after: "react monorepo" },
            { key: "description", collapsed: "append", added: ["Group react."] },
          ],
        },
      ],
      flattened: { merged: [{ key: "description", collapsed: "append", added: ["From minor."] }] },
    });
  });
});

const NET_EFFECT =
  'automerge (A=false, B=true), groupName (unset in A, B="react monorepo"); ' +
  "description also changed (documentation)";

const REF = (index: number, label: string) => ({
  index,
  label,
  signature: JSON.stringify([[label, ["react", "react-dom", "@types/react"]]]),
});

const COMPARISON: SimulationComparison = {
  summary: `differs: ${NET_EFFECT}`,
  verdict: "differs",
  netEffect: NET_EFFECT,
  mode: "config",
  stoppedMatching: [REF(1, "matchPackageNames")],
  startedMatching: [],
  matchedInBoth: [REF(2, "matchDepTypes")],
  configDelta: [
    { key: "automerge", kind: "behavioral", a: false, b: true, inA: true, inB: true },
    { key: "groupName", kind: "behavioral", b: "react monorepo", inA: false, inB: true },
    {
      key: "description",
      kind: "documentation",
      a: DESCRIPTION,
      b: [...DESCRIPTION, "And this one."],
      inA: true,
      inB: true,
    },
  ],
  identity: {
    changed: true,
    signatureChanges: [
      {
        a: REF(3, "matchPackageNames"),
        b: REF(3, "matchPackageNames"),
        kind: "clause-values-changed",
        keys: ["matchPackageNames"],
      },
    ],
    onlyInA: [REF(3, "matchPackageNames")],
    onlyInB: [REF(3, "matchPackageNames")],
  },
};

describe("comparisonPayload", () => {
  test("collapsing never moves a key: same keys, same order, smaller values", () => {
    const payload = comparisonPayload(COMPARISON, { scope: "package-rules", detail: "full" });
    expect(payload.configDelta.map((delta) => delta.key)).toEqual([
      "automerge",
      "groupName",
      "description",
    ]);
    expect(payload.configDelta[2]).toMatchObject({
      collapsed: "append",
      added: ["And this one."],
      kind: "documentation",
      inA: true,
      inB: true,
    });
    expect(JSON.stringify(payload.configDelta).length).toBeLessThan(
      JSON.stringify(COMPARISON.configDelta).length,
    );
    expect(payload.configView).toEqual({ scope: "package-rules", keys: 3 });
  });

  test("keys narrows the delta, and the verdict is left alone", () => {
    const payload = comparisonPayload(COMPARISON, {
      scope: "package-rules",
      detail: "full",
      keys: ["groupName", "labels"],
    });
    expect(payload.configDelta.map((delta) => delta.key)).toEqual(["groupName"]);
    expect(payload.configView.withheld).toEqual([{ key: "labels", reason: "absent" }]);
    // The comparison FOUND three changed keys; a narrowed view does not get to
    // restate what it found.
    expect(payload.summary).toBe(COMPARISON.summary);
    expect(payload.verdict).toBe("differs");
    expect(payload.netEffect).toBe(COMPARISON.netEffect);
  });
});

/**
 * Roadmap 073: the comparison's own detail axis. The two things the default
 * drops are the two that cost — `matchedInBoth` (every rule that behaved the
 * same, in a diff) and the `signature` strings, each a whole selector array
 * re-serialized next to the `label` that already names the rule — and it names
 * the level that puts them back.
 */
describe("comparisonPayload detail levels", () => {
  const at = (detail: "verdict" | "rules" | "full") =>
    comparisonPayload(COMPARISON, { scope: "package-rules", detail, transport: "mcp" });

  test("the default states identity as counts and drops matchedInBoth", () => {
    const payload = at("verdict");
    expect(payload).not.toHaveProperty("matchedInBoth");
    expect(payload.identity).toEqual({
      changed: true,
      counts: { onlyInA: 1, onlyInB: 1, signatureChanges: 1 },
    });
    // The behavior arrays stay — they are the evidence for the verdict — but a
    // rule is identified by `label` + `index`, not by a re-serialized selector.
    expect(payload.stoppedMatching).toEqual([{ index: 1, label: "matchPackageNames" }]);
    // …and the omission names its own reversal.
    expect(payload.notes?.join(" ")).toContain('`detail: "rules"`');
    expect(payload.notes?.join(" ")).toContain("`matchedInBoth`");
  });

  test('detail "rules" puts the arrays back, still without the signatures', () => {
    const payload = at("rules");
    expect(payload.matchedInBoth).toEqual([{ index: 2, label: "matchDepTypes" }]);
    expect(payload.identity.counts).toBeUndefined();
    expect(payload.identity.onlyInA).toEqual([{ index: 3, label: "matchPackageNames" }]);
    expect(payload.identity.signatureChanges?.[0]).toMatchObject({
      kind: "clause-values-changed",
      a: { index: 3, label: "matchPackageNames" },
    });
    expect(JSON.stringify(payload)).not.toContain("@types/react");
    expect(payload.notes?.join(" ")).toContain('`detail: "full"`');
  });

  test('detail "full" is the engine\'s comparison, signatures and all', () => {
    const payload = at("full");
    expect(payload.matchedInBoth).toEqual(COMPARISON.matchedInBoth);
    expect(payload.identity).toBe(COMPARISON.identity);
    expect(JSON.stringify(payload)).toContain("@types/react");
    // Nothing withheld, so there is nothing to point at.
    expect(payload.notes).toBeUndefined();
  });

  test("the note speaks the caller's own spelling", () => {
    const cli = comparisonPayload(COMPARISON, {
      scope: "package-rules",
      detail: "verdict",
      transport: "cli",
    });
    expect(cli.notes?.join(" ")).toContain("`--detail rules`");
    expect(cli.notes?.join(" ")).not.toContain('detail: "rules"');
  });

  test("the verdict is never projected, at any level", () => {
    for (const detail of ["verdict", "rules", "full"] as const) {
      const payload = at(detail);
      expect(payload.summary).toBe(COMPARISON.summary);
      expect(payload.verdict).toBe("differs");
      expect(payload.netEffect).toBe(COMPARISON.netEffect);
      expect(payload.identity.changed).toBe(true);
    }
  });
});
