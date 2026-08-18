import { describe, expect, test } from "vitest";
import type { KeyProvenance } from "@renovate-config-debugger/engine";
import { chainStepText, entryView, perDependencyNote } from "./provenance";

/**
 * Roadmap 071: what a step of the override chain reports for a key Renovate
 * CONCATENATES. Every such step's `before`/`after` is a cumulative snapshot of
 * the whole array, so the chain restated it once per layer — the contribution
 * is the slice, and the totals say where it sits.
 */

function entry(chain: KeyProvenance["chain"], finalValue: unknown): KeyProvenance {
  return { key: "labels", finalValue, isDefaultOnly: false, chain };
}

describe("entryView", () => {
  test("an appending layer reports what it appended, not the whole array", () => {
    const view = entryView(
      entry(
        [
          { layer: { kind: "global" }, action: "set", before: undefined, after: ["a"] },
          { layer: { kind: "repo" }, action: "concat", before: ["a"], after: ["a", "b", "c"] },
        ],
        ["a", "b", "c"],
      ),
    );
    expect(view.chain[1]).toEqual({
      layer: "repo",
      action: "concat",
      addedCount: 2,
      added: ["b", "c"],
      totalCount: 3,
    });
    // The establishing step is not an append and keeps both sides.
    expect(view.chain[0]).toMatchObject({ action: "set", after: ["a"] });
  });

  test("a concat that did NOT append keeps the snapshots — honest over clever", () => {
    // Renovate's nested-`extends` pass can rewrite `after` wholesale, and a
    // "slice" of an array that is not a prefix would be an invented one.
    const view = entryView(
      entry(
        [
          {
            layer: { kind: "repo" },
            action: "concat",
            before: ["a"],
            after: ["x", "y"],
            expandedNested: true,
          },
        ],
        ["x", "y"],
      ),
    );
    expect(view.chain[0]).toEqual({
      layer: "repo",
      action: "concat",
      before: ["a"],
      after: ["x", "y"],
      expandedNested: true,
    });
  });

  test("noop steps stay out of the chain", () => {
    const view = entryView(
      entry(
        [
          { layer: { kind: "defaults" }, action: "set", before: undefined, after: [], noop: true },
          { layer: { kind: "repo" }, action: "concat", before: [], after: ["a"] },
        ],
        ["a"],
      ),
    );
    expect(view.chain).toHaveLength(1);
  });
});

describe("chainStepText", () => {
  test("an append reads as an append, a replacement as the value", () => {
    const view = entryView(
      entry(
        [
          { layer: { kind: "global" }, action: "set", before: undefined, after: ["a"] },
          { layer: { kind: "repo" }, action: "concat", before: ["a"], after: ["a", "b"] },
        ],
        ["a", "b"],
      ),
    );
    expect(view.chain.map((step) => chainStepText(step))).toEqual(['["a"]', '+1 → 2 total ["b"]']);
  });
});

/**
 * Replay-04 (CLI expert on 44006): `provenance automerge` carried no
 * per-dependency note while `labels`/`autoApprove` did — `automerge` was set
 * only INSIDE `:automergeMinor`'s update-type blocks, which the direct `key in
 * rule` scan missed, and the absence read as "no rule touches this".
 */
describe("perDependencyNote", () => {
  test("a direct rule-level setter counts as before", () => {
    const note = perDependencyNote("labels", { packageRules: [{ labels: ["deps"] }] });
    expect(note).toContain("1 packageRule can set `labels` per-dependency");
    expect(note).not.toContain("update-type block");
  });

  test("a key set only inside an update-type block counts, named as conditional", () => {
    const note = perDependencyNote("automerge", {
      packageRules: [{ matchPackageNames: ["react"], minor: { automerge: true } }],
    });
    expect(note).toContain("1 packageRule can set `automerge` per-dependency");
    expect(note).toContain("only inside an update-type block");
    expect(note).toContain("applies only when the update's type matches");
  });

  test("mixed direct and nested setters state how many are conditional", () => {
    const note = perDependencyNote("automerge", {
      packageRules: [
        { matchPackageNames: ["a"], automerge: true },
        { matchPackageNames: ["b"], minor: { automerge: true } },
        { matchPackageNames: ["c"], patch: { automerge: true } },
      ],
    });
    expect(note).toContain("3 packageRules can set `automerge` per-dependency");
    expect(note).toContain("2 of them only inside an update-type block");
  });

  test("a rule that sets the key both ways is counted once, as direct", () => {
    const note = perDependencyNote("automerge", {
      packageRules: [{ automerge: false, minor: { automerge: true } }],
    });
    expect(note).toContain("1 packageRule can set `automerge` per-dependency");
    expect(note).not.toContain("update-type block");
  });

  test("no setter anywhere stays silent, and packageRules itself is exempt", () => {
    const rules = { packageRules: [{ minor: { automerge: true } }] };
    expect(perDependencyNote("labels", rules)).toBeUndefined();
    expect(perDependencyNote("packageRules", rules)).toBeUndefined();
  });
});
