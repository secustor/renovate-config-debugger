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
  test('detail "full" is the escape hatch — the result itself, not a rebuild', () => {
    expect(simulationPayload(SIM, { detail: "full", scope: "package-rules" })).toBe(SIM);
    expect(simulationPayload(SIM, { detail: "full", scope: "full", keys: ["automerge"] })).toBe(
      SIM,
    );
  });

  test("the default answer is exactly the listed members", () => {
    const payload = simulationPayload(SIM, { detail: "verdict", scope: "package-rules" });
    expect(Object.keys(payload)).toEqual([
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

const COMPARISON: SimulationComparison = {
  matchedOnlyInA: [],
  matchedOnlyInB: [],
  matchedInBoth: [],
  behaviorOnlyInA: [],
  behaviorOnlyInB: [],
  signatureChanges: [],
  rulesChanged: false,
  configDelta: [
    { key: "automerge", before: false, after: true, inA: true, inB: true },
    {
      key: "description",
      before: DESCRIPTION,
      after: [...DESCRIPTION, "And this one."],
      inA: true,
      inB: true,
    },
    { key: "groupName", after: "react monorepo", inA: false, inB: true },
  ],
  noChange: false,
  summary: "differs: automerge, description, groupName",
};

describe("comparisonPayload", () => {
  test("collapsing never moves a key: same keys, same order, smaller values", () => {
    const payload = comparisonPayload(COMPARISON, { scope: "package-rules" });
    expect(payload.configDelta.map((delta) => delta.key)).toEqual([
      "automerge",
      "description",
      "groupName",
    ]);
    expect(payload.configDelta[1]).toMatchObject({
      collapsed: "append",
      added: ["And this one."],
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
    expect(payload.noChange).toBe(false);
  });
});
