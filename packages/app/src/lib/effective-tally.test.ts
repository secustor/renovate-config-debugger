import type { ProvenanceLayer } from "@renovate-config-debugger/engine";
import { describe, expect, it } from "vitest";
import { effectiveTally, multiContribBadgeKind } from "./effective-tally";
import { presetLayer, provEntry, provStep } from "@tools/test/key-provenance";

/**
 * The Effective config badge's arithmetic — `rcd digest`'s effective clause and
 * `rcd provenance`'s tally line read the same three numbers.
 * `row-notes.test.ts` owns the badge prose; this owns the counting.
 */

const DEFAULTS: ProvenanceLayer = { kind: "defaults" };
const REPO: ProvenanceLayer = { kind: "repo" };
const RECOMMENDED: ProvenanceLayer = presetLayer("p1", "config:recommended");

describe("effectiveTally", () => {
  it("counts an empty run at zero", () => {
    expect(effectiveTally([])).toEqual({ keys: 0, overridden: 0, hiddenDefaults: 0 });
  });

  it("separates defaults, set-once, replaced and appended keys", () => {
    // The appended key is the load-bearing case: two layers touched it, so
    // `isOverridden` is true, but nothing was REPLACED — it must not raise
    // `overridden`, which counts only rows carrying the literal badge.
    const entries = [
      provEntry("prHourlyLimit", [provStep(DEFAULTS, 2)]),
      provEntry("dependencyDashboard", [provStep(REPO, true)]),
      provEntry("rangeStrategy", [
        provStep(RECOMMENDED, "replace"),
        provStep(REPO, "bump", { action: "overwrite", before: "replace" }),
      ]),
      provEntry("labels", [
        provStep(RECOMMENDED, ["deps"]),
        provStep(REPO, ["deps", "renovate"], { action: "concat", before: ["deps"] }),
      ]),
    ];

    expect(effectiveTally(entries)).toEqual({ keys: 3, overridden: 1, hiddenDefaults: 1 });
  });

  it("consumes any iterable once — `digest.ts` feeds it `provenance.values()`", () => {
    const byKey = new Map([
      ["prHourlyLimit", provEntry("prHourlyLimit", [provStep(DEFAULTS, 2)])],
      ["dependencyDashboard", provEntry("dependencyDashboard", [provStep(REPO, true)])],
    ]);

    expect(effectiveTally(byKey.values())).toEqual({
      keys: 1,
      overridden: 0,
      hiddenDefaults: 1,
    });
  });
});

it("calls a merged key merged, not overridden", () => {
  const entry = provEntry("hostRules", [
    provStep(RECOMMENDED, { abc: 1 }),
    provStep(REPO, { abc: 1, def: 2 }, { action: "deep-merge", before: { abc: 1 } }),
  ]);

  expect(multiContribBadgeKind(entry)).toBe("merged");
  expect(effectiveTally([entry])).toEqual({ keys: 1, overridden: 0, hiddenDefaults: 0 });
});
