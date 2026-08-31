import type { ProvenanceLayer, ProvenanceStep } from "@renovate-config-debugger/engine";
import { expect, it } from "vitest";
import { rowNote, sameValueLayers } from "./row-notes";
import { presetLayer, provEntry, provStep } from "@tools/test/key-provenance";

/**
 * Roadmap 082: the third cell's note. The same-value overlap is the one fact
 * here the view could not state before — the losing steps that set exactly what
 * the winner did were filtered out of every rendering — so it is tested against
 * hand-built chains, which can hold the shapes a run produces only rarely.
 */

const DEFAULTS: ProvenanceLayer = { kind: "defaults" };
const REPO: ProvenanceLayer = { kind: "repo" };
const DASHBOARD: ProvenanceLayer = presetLayer(":dependencyDashboard", "p1");
const RECOMMENDED: ProvenanceLayer = presetLayer("config:recommended", "p2");

/** Every chain here is one key's, so the name is fixed. */
function entry(chain: ProvenanceStep[]) {
  return provEntry("dependencyDashboard", chain);
}

it("names the layer that set the winner's value first, in the warn tone", () => {
  // The design's own example: a preset already turned the dashboard on, and the
  // repo config says so again — the line changes nothing.
  const dashboard = entry([
    provStep(DEFAULTS, false, { noop: true }),
    provStep(DASHBOARD, true),
    provStep(REPO, true, { action: "overwrite", before: true }),
  ]);

  expect(sameValueLayers(dashboard).map((l) => l.kind)).toEqual(["preset"]);
  expect(rowNote(dashboard)).toEqual({
    text: "also set by :dependencyDashboard — same value",
    warn: true,
  });
});

it("counts the rest when more than one layer said the same thing", () => {
  const twice = entry([
    provStep(RECOMMENDED, "replace"),
    provStep(DASHBOARD, "replace"),
    provStep(REPO, "replace", { action: "overwrite", before: "replace" }),
  ]);

  expect(rowNote(twice)?.text).toBe("also set by config:recommended +1 more — same value");
});

it("says nothing when the layers genuinely disagreed", () => {
  const overridden = entry([
    provStep(DEFAULTS, "auto", { noop: true }),
    provStep(RECOMMENDED, "replace"),
    provStep(REPO, "bump", { action: "overwrite", before: "replace" }),
  ]);

  expect(sameValueLayers(overridden)).toEqual([]);
  expect(rowNote(overridden)).toEqual({ text: "overridden", badge: "overridden" });
});

it("compares values structurally, not by reference", () => {
  const arrays = entry([
    provStep(RECOMMENDED, ["**/node_modules/**"]),
    provStep(REPO, ["**/node_modules/**"], { action: "overwrite", before: [] }),
  ]);

  expect(sameValueLayers(arrays)).toHaveLength(1);
});

/** GAP-9: the design's prose, not the one-word badge — "appended" alone left a
 *  reader who had just seen "overridden" on the row above to work out that the
 *  two words are opposites. */
it("spells out an append rather than badging it", () => {
  const rules = entry([
    provStep(RECOMMENDED, [1, 2], { action: "concat" }),
    provStep(REPO, [1, 2, 3], { action: "concat" }),
  ]);

  expect(rowNote(rules)).toEqual({ text: "appended, not overridden", badge: "appended" });
});

it("gives the description row its writer count", () => {
  const description = entry([provStep(RECOMMENDED, ["a"], { action: "concat" })]);

  expect(rowNote(description, "5 presets")).toEqual({ text: "5 presets wrote these" });
});

it("has nothing to say about a key one layer simply set", () => {
  expect(rowNote(entry([provStep(REPO, ["dependencies"])]))).toBeNull();
});
