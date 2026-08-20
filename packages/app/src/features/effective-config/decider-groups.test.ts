import type {
  KeyProvenance,
  ProvenanceLayer,
  ProvenanceStep,
} from "@renovate-config-debugger/engine";
import { expect, it } from "vitest";
import { countByDecider, decidedBy, groupByDecider, winningStep } from "./decider-groups";

/**
 * Roadmap 075 (iteration 5): the effective config's rows are cut by WHO DECIDED
 * each key. The rule is one line long — the last non-no-op step of the chain
 * the engine already built — and everything the sections claim rests on it, so
 * it is tested here against hand-built chains rather than only through the
 * component (which can only reach the shapes a real run happens to produce).
 */

function step(layer: ProvenanceLayer, extra: Partial<ProvenanceStep> = {}): ProvenanceStep {
  return { layer, action: "set", before: undefined, after: 1, ...extra };
}

function entry(key: string, chain: ProvenanceStep[]): KeyProvenance {
  return {
    key,
    finalValue: 1,
    isDefaultOnly: chain.every((s) => s.layer.kind === "defaults"),
    chain,
  };
}

const DEFAULTS: ProvenanceLayer = { kind: "defaults" };
const REPO: ProvenanceLayer = { kind: "repo" };
const PRESET: ProvenanceLayer = { kind: "preset", nodeId: "p1", name: "config:recommended" };

it("credits the last layer that actually changed the value", () => {
  expect(decidedBy(entry("a", [step(DEFAULTS), step(PRESET), step(REPO)]))).toBe("repo");
  expect(decidedBy(entry("b", [step(DEFAULTS), step(PRESET)]))).toBe("preset");
  expect(decidedBy(entry("c", [step(DEFAULTS)]))).toBe("defaults");
});

/**
 * The one case that separates "decided" from "touched last": a layer whose
 * contribution changed nothing (an empty-array concat, a defaulted-then-
 * overridden value) is a no-op step, and crediting it would tell the reader to
 * go edit a preset that did nothing. This is the same `noop` flag the row's
 * origin chip and the override chain have always skipped.
 */
it("skips no-op contributions", () => {
  const e = entry("labels", [step(DEFAULTS), step(REPO), step(PRESET, { noop: true })]);
  expect(decidedBy(e)).toBe("repo");
  expect(winningStep(e)?.layer.kind).toBe("repo");
});

/** A chain of nothing but no-ops still has to answer: the last step is the
 *  honest fallback, exactly as the origin chip renders it. */
it("falls back to the last step when every step is a no-op", () => {
  expect(decidedBy(entry("x", [step(DEFAULTS, { noop: true })]))).toBe("defaults");
});

it("orders the groups from the reader's own config outwards, omitting empty ones", () => {
  const groups = groupByDecider([
    entry("fromDefault", [step(DEFAULTS)]),
    entry("fromRepo", [step(REPO)]),
    entry("fromPreset", [step(PRESET)]),
    entry("alsoRepo", [step(REPO)]),
  ]);
  expect(groups.map((g) => g.id)).toEqual(["repo", "preset", "defaults"]);
  // …and the rows keep the order they arrived in within their group.
  expect(groups[0]?.entries.map((e) => e.key)).toEqual(["fromRepo", "alsoRepo"]);
});

it("counts the same way it groups", () => {
  const entries = [
    entry("a", [step(REPO)]),
    entry("b", [step(PRESET)]),
    entry("c", [step(PRESET)]),
  ];
  expect(countByDecider(entries)).toEqual(
    new Map([
      ["repo", 1],
      ["preset", 2],
    ]),
  );
});

/** The 008 layers are not a special case: they are two more kinds in the same
 *  vocabulary, and a run without them simply produces no such group. */
it("gives the global and inherited layers groups of their own", () => {
  const groups = groupByDecider([
    entry("g", [step({ kind: "global" })]),
    entry("i", [step({ kind: "inherited" })]),
    entry("r", [step(REPO)]),
  ]);
  expect(groups.map((g) => g.id)).toEqual(["repo", "inherited", "global"]);
});
