import type { PresetNode, ProvenanceLayer } from "@renovate-config-debugger/engine";
import { expect, it } from "vitest";
import {
  deciderHead,
  decidedBy,
  groupByDecider,
  presetDeciderName,
  topLevelPresetNames,
  winningStep,
} from "./decider-groups";
import { presetLayer, provEntry, provStep } from "@tools/test/key-provenance";

/**
 * Roadmap 075 (iteration 5): the effective config's rows are cut by WHO DECIDED
 * each key. The rule is one line long — the last non-no-op step of the chain
 * the engine already built — and everything the sections claim rests on it, so
 * it is tested here against hand-built chains rather than only through the
 * component (which can only reach the shapes a real run happens to produce).
 */

const DEFAULTS: ProvenanceLayer = { kind: "defaults" };
const REPO: ProvenanceLayer = { kind: "repo" };
const PRESET: ProvenanceLayer = presetLayer("config:recommended");

it("credits the last layer that actually changed the value", () => {
  expect(decidedBy(provEntry("a", [provStep(DEFAULTS), provStep(PRESET), provStep(REPO)]))).toBe(
    "repo",
  );
  expect(decidedBy(provEntry("b", [provStep(DEFAULTS), provStep(PRESET)]))).toBe("preset");
  expect(decidedBy(provEntry("c", [provStep(DEFAULTS)]))).toBe("defaults");
});

/**
 * The one case that separates "decided" from "touched last": a layer whose
 * contribution changed nothing (an empty-array concat, a defaulted-then-
 * overridden value) is a no-op step, and crediting it would tell the reader to
 * go edit a preset that did nothing. This is the same `noop` flag the row's
 * origin chip and the override chain have always skipped.
 */
it("skips no-op contributions", () => {
  const e = provEntry("labels", [
    provStep(DEFAULTS),
    provStep(REPO),
    provStep(PRESET, 1, { noop: true }),
  ]);
  expect(decidedBy(e)).toBe("repo");
  expect(winningStep(e)?.layer.kind).toBe("repo");
});

/** A chain of nothing but no-ops still has to answer: the last step is the
 *  honest fallback, exactly as the origin chip renders it. */
it("falls back to the last step when every step is a no-op", () => {
  expect(decidedBy(provEntry("x", [provStep(DEFAULTS, 1, { noop: true })]))).toBe("defaults");
});

it("orders the groups from the reader's own config outwards, omitting empty ones", () => {
  const groups = groupByDecider([
    provEntry("fromDefault", [provStep(DEFAULTS)]),
    provEntry("fromRepo", [provStep(REPO)]),
    provEntry("fromPreset", [provStep(PRESET)]),
    provEntry("alsoRepo", [provStep(REPO)]),
  ]);
  expect(groups.map((g) => g.id)).toEqual(["repo", "preset", "defaults"]);
  // …and the rows keep the order they arrived in within their group.
  expect(groups[0]?.entries.map((e) => e.key)).toEqual(["fromRepo", "alsoRepo"]);
});

/** The 008 layers are not a special case: they are two more kinds in the same
 *  vocabulary, and a run without them simply produces no such group. */
it("gives the global and inherited layers groups of their own", () => {
  const groups = groupByDecider([
    provEntry("g", [provStep({ kind: "global" })]),
    provEntry("i", [provStep({ kind: "inherited" })]),
    provEntry("r", [provStep(REPO)]),
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

/**
 * Roadmap 092: the group header is a PROSE title and one toned pill; the count
 * beside it is the standard table's own, off the rows it is showing. The tones
 * are the app's existing `.pill-*` suffixes, so a header and the layer chips on
 * its rows cannot disagree about the hue a level wears.
 */
it("heads each group with prose and its layer's own pill", () => {
  expect(deciderHead("preset", "config:recommended")).toEqual({
    title: "config:recommended",
    pill: { label: "presets", tone: "preset" },
  });
  // No resolved top-level preset to name — the generic wording, not a blank.
  expect(deciderHead("preset", null)).toEqual({
    title: "Presets",
    pill: { label: "presets", tone: "preset" },
  });
  expect(deciderHead("repo")).toEqual({
    title: "Your repo config",
    pill: { label: "repo config", tone: "accent" },
  });
  expect(deciderHead("defaults")).toEqual({
    title: "Renovate defaults",
    pill: { label: "defaults", tone: "muted" },
  });
  // Only the presets group takes a name from the run.
  expect(deciderHead("global", "config:recommended").title).toBe("The global config");
});
