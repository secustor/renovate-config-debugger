/**
 * Roadmap 054 (variant A): the thread derivation is the simulator's single
 * source of truth about who wrote a setting — layer 2's thread ledger is its
 * only reader — so it is tested directly, on hand-written
 * `SimulationResult`/`MergeStop` fixtures rather than by running the engine.
 * The fixtures spell the shapes the engine really produces: a `merged` entry
 * omits `before` when the key did not exist yet and omits `after` when the
 * merge removed it (engine `diffKeys`), and merge stops are contiguous, so the
 * earliest writer's `before` IS the pre-rules value.
 */
import type {
  ClauseEvaluation,
  MergedKey,
  ProvenanceLayer,
  RuleEvaluation,
  SimulationResult,
} from "@renovate-config-debugger/engine";
import { describe, expect, test } from "vitest";
import type { MergeStop } from "./merge-stops";
import { buildVerdictThreads } from "./verdict-threads";

const PRESET_LAYER: ProvenanceLayer = { kind: "preset", nodeId: "n1", name: "config:recommended" };
const REPO_LAYER: ProvenanceLayer = { kind: "repo" };

const MATCHED_CLAUSE: ClauseEvaluation = {
  key: "matchPackageNames",
  value: ["renovate"],
  state: "matched",
  inputValues: { packageName: "renovate" },
  readFields: ["packageName"],
};

/** The chip/step halves of a `MergeStop` are the timeline's rendering payload;
 *  the derivation reads only `kind`/`ruleIndex`/`merged`. */
function stopChrome(id: string): Pick<MergeStop, "chip" | "step"> {
  return {
    chip: { label: id, ariaLabel: id },
    step: { id, before: {}, after: {}, head: id },
  };
}

function baseStop(): MergeStop {
  return { kind: "base", ...stopChrome("base") };
}

function ruleStop(ruleIndex: number, merged: MergedKey[]): MergeStop {
  return { kind: "rule", ruleIndex, merged, ...stopChrome(`rule-${ruleIndex}`) };
}

function flattenStop(merged: MergedKey[]): MergeStop {
  return { kind: "flatten", merged, ...stopChrome("flatten") };
}

function finalStop(): MergeStop {
  return { kind: "final", ...stopChrome("final") };
}

function matchedRule(
  index: number,
  clauses: ClauseEvaluation[] = [MATCHED_CLAUSE],
): RuleEvaluation {
  return { index, verdict: "matched", clauses, notes: [] };
}

function simFixture(
  finalDependencyConfig: Record<string, unknown>,
  rules: RuleEvaluation[] = [],
): SimulationResult {
  return {
    rules,
    rawFinalConfig: finalDependencyConfig,
    finalDependencyConfig,
    flattened: { merged: [], blocks: {}, authoredBlocks: [] },
    missingInputs: { rules: 0, groups: [] },
    evaluationErrors: { rules: 0, selectors: [], messages: [], sampleRuleIndexes: [] },
    mergeSteps: [],
    errors: [],
    warnings: [],
    notes: [],
  };
}

/** Contested `groupName`: a preset rule sets it, a repo rule later overwrites
 *  it — the cascade the whole feature exists for. */
const CONTESTED_STOPS: MergeStop[] = [
  baseStop(),
  ruleStop(0, [{ key: "groupName", before: "all dependencies", after: "front-end" }]),
  ruleStop(3, [{ key: "groupName", before: "front-end", after: "renovate core" }]),
  finalStop(),
];
const CONTESTED_LAYERS = new Map<number, ProvenanceLayer>([
  [0, PRESET_LAYER],
  [3, REPO_LAYER],
]);
const CONTESTED_SIM = simFixture({ groupName: "renovate core" }, [matchedRule(0), matchedRule(3)]);

/** A flatten stop has the last word over the rule that ran before it. */
const FLATTEN_STOPS: MergeStop[] = [
  baseStop(),
  ruleStop(1, [{ key: "automerge", after: true }]),
  flattenStop([{ key: "automerge", before: true, after: false }]),
  finalStop(),
];
const FLATTEN_SIM = simFixture({ automerge: false }, [matchedRule(1)]);

const NO_LAYERS = new Map<number, ProvenanceLayer>();

describe("buildVerdictThreads", () => {
  test("a contested key cascades newest first, and the last stop wins", () => {
    const [thread] = buildVerdictThreads(
      ["groupName"],
      CONTESTED_STOPS,
      CONTESTED_LAYERS,
      CONTESTED_SIM,
    );
    expect(thread).toEqual({
      key: "groupName",
      finalValue: "renovate core",
      present: true,
      verb: "set",
      winner: {
        kind: "rule",
        ruleIndex: 3,
        layer: REPO_LAYER,
        clauses: [MATCHED_CLAUSE],
        stopIndex: 2,
        stopLabel: "step 2 of 2",
      },
      overrides: [
        {
          kind: "writer",
          value: "front-end",
          ruleIndex: 0,
          layer: PRESET_LAYER,
          stopIndex: 1,
          stopLabel: "step 1 of 2",
        },
        { kind: "base", value: "all dependencies", present: true },
      ],
      writerCount: 2,
    });
  });

  test("an array key whose previous value is a strict prefix was appended", () => {
    const stops = [
      baseStop(),
      ruleStop(0, [{ key: "labels", before: ["renovate"], after: ["renovate", "deps"] }]),
      finalStop(),
    ];
    const [thread] = buildVerdictThreads(
      ["labels"],
      stops,
      NO_LAYERS,
      simFixture({ labels: ["renovate", "deps"] }, [matchedRule(0)]),
    );
    expect(thread?.verb).toBe("appended");
  });

  test("a rewritten array is set, not appended", () => {
    const stops = [
      baseStop(),
      ruleStop(0, [{ key: "labels", before: ["renovate"], after: ["deps", "renovate"] }]),
      finalStop(),
    ];
    const [thread] = buildVerdictThreads(
      ["labels"],
      stops,
      NO_LAYERS,
      simFixture({ labels: ["deps", "renovate"] }, [matchedRule(0)]),
    );
    expect(thread?.verb).toBe("set");
  });

  test("a key missing from the final config was removed", () => {
    const stops = [
      baseStop(),
      ruleStop(0, [{ key: "schedule", before: ["on monday"] }]),
      finalStop(),
    ];
    const [thread] = buildVerdictThreads(
      ["schedule"],
      stops,
      NO_LAYERS,
      simFixture({}, [matchedRule(0)]),
    );
    expect(thread?.verb).toBe("removed");
    expect(thread?.present).toBe(false);
    expect(thread?.finalValue).toBeUndefined();
    expect(thread?.overrides).toEqual([{ kind: "base", value: ["on monday"], present: true }]);
  });

  test("a flatten stop can win, and carries no clause evidence", () => {
    const [thread] = buildVerdictThreads(["automerge"], FLATTEN_STOPS, NO_LAYERS, FLATTEN_SIM);
    expect(thread?.winner).toEqual({
      kind: "flatten",
      ruleIndex: undefined,
      layer: undefined,
      clauses: [],
      stopIndex: 2,
      stopLabel: "flatten step",
    });
    expect(thread?.writerCount).toBe(2);
    expect(thread?.overrides[0]).toEqual({
      kind: "writer",
      value: true,
      ruleIndex: 1,
      layer: undefined,
      stopIndex: 1,
      stopLabel: "step 1 of 1",
    });
  });

  test("a single writer has one writer and a bare base entry", () => {
    const stops = [baseStop(), ruleStop(2, [{ key: "rangeStrategy", after: "bump" }]), finalStop()];
    const [thread] = buildVerdictThreads(
      ["rangeStrategy"],
      stops,
      new Map([[2, REPO_LAYER]]),
      simFixture({ rangeStrategy: "bump" }, [matchedRule(2)]),
    );
    expect(thread?.writerCount).toBe(1);
    // The key did not exist before the rules ran — `present: false` is what
    // stops the UI from striking through a value that never was.
    expect(thread?.overrides).toEqual([{ kind: "base", value: undefined, present: false }]);
    expect(thread?.winner?.stopLabel).toBe("step 1 of 1");
  });

  test("a changed key no stop names has no winner and no cascade", () => {
    const [thread] = buildVerdictThreads(
      ["minor"],
      [baseStop(), ruleStop(0, [{ key: "groupName", after: "x" }]), finalStop()],
      NO_LAYERS,
      simFixture({ groupName: "x" }, [matchedRule(0)]),
    );
    expect(thread?.winner).toBeUndefined();
    expect(thread?.overrides).toEqual([]);
    expect(thread?.writerCount).toBe(0);
  });

  test("without a simulation nothing is present", () => {
    const [thread] = buildVerdictThreads(["groupName"], CONTESTED_STOPS, CONTESTED_LAYERS, null);
    expect(thread?.present).toBe(false);
    expect(thread?.verb).toBe("removed");
    expect(thread?.winner?.stopIndex).toBe(2);
  });
});
