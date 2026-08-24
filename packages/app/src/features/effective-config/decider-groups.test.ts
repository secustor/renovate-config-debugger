import type {
  KeyProvenance,
  PresetNode,
  ProvenanceLayer,
  ProvenanceStep,
} from "@renovate-config-debugger/engine";
import { expect, it } from "vitest";
import {
  deciderHeadline,
  decidedBy,
  groupByDecider,
  presetDeciderName,
  topLevelPresetNames,
  winningStep,
} from "./decider-groups";

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

/**
 * Roadmap 082 (GAP-3): the presets band is named after the reader's own
 * `extends`, because "which line do I delete" is the question the band answers.
 * The names come off the preset tree's top level — the only presets the merge
 * replay ever gives a layer to.
 */
function node(name: string, extra: Partial<PresetNode> = {}): PresetNode {
  return { id: name, name, state: "resolved", children: [], ...extra };
}

it("names the top-level extends, skipping nested and failed ones", () => {
  const root: PresetNode = {
    id: "root",
    name: "(input config)",
    state: "resolved",
    children: [
      node("config:recommended"),
      node("group:monorepos", { nested: true }),
      node("github>me/broken", { state: "error" }),
      node(":dependencyDashboard"),
    ],
  };

  expect(topLevelPresetNames(root)).toEqual(["config:recommended", ":dependencyDashboard"]);
  expect(topLevelPresetNames(undefined)).toEqual([]);
});

it("names one extend, counts the rest, and stays generic with none", () => {
  expect(presetDeciderName(["config:recommended"])).toBe("config:recommended");
  expect(presetDeciderName(["config:recommended", ":pinAll", ":labels(deps)"])).toBe(
    "config:recommended +2 more",
  );
  expect(presetDeciderName([])).toBeNull();
});

it("heads each band with what the group means, not just its size", () => {
  expect(deciderHeadline("preset", 24, "config:recommended")).toEqual({
    lead: "config:recommended decided",
    count: "24 options",
    note: null,
  });
  // No resolved top-level preset to name — the generic wording, not a blank.
  expect(deciderHeadline("preset", 1, null)).toEqual({
    lead: "Presets decided",
    count: "1 option",
    note: null,
  });
  expect(deciderHeadline("repo", 4)).toEqual({
    lead: "Your repo config decided",
    count: "4 options",
    note: "— the ones you can edit directly",
  });
  // The defaults header carries its count in the lead — the design paints the
  // whole line muted, so there is nothing for the hued count span to hold.
  expect(deciderHeadline("defaults", 34)).toEqual({
    lead: "Renovate defaults filled the remaining 34",
    count: null,
    note: "— nothing in your run touched them",
  });
});
