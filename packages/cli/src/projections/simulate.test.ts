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
      "flattened",
      "finalDependencyConfig",
      "configView",
      "errors",
      "warnings",
      "notes",
      "detailNote",
    ]);
    expect(payload).not.toHaveProperty("mergeSteps");
    expect(payload).not.toHaveProperty("rawFinalConfig");
    expect(payload).toHaveProperty("detailNote", VERDICT_DETAIL_NOTE);
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
    expect(payload).toMatchObject({
      missingInputs: sim.missingInputs,
      missingInputsNote: `${sim.missingInputs.note} \`verdict: "no-input"\` lists them.`,
    });
    // Nothing to point at, no key: the shape never carries an empty sentence.
    expect(
      simulationPayload(SIM, { detail: "verdict", scope: "package-rules", transport: "cli" }),
    ).not.toHaveProperty("missingInputsNote");
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

const COMPARISON: SimulationComparison = {
  summary: `differs: ${NET_EFFECT}`,
  verdict: "differs",
  netEffect: NET_EFFECT,
  mode: "config",
  stoppedMatching: [],
  startedMatching: [],
  matchedInBoth: [],
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
  identity: { changed: false, signatureChanges: [], onlyInA: [], onlyInB: [] },
};

describe("comparisonPayload", () => {
  test("collapsing never moves a key: same keys, same order, smaller values", () => {
    const payload = comparisonPayload(COMPARISON, { scope: "package-rules" });
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
