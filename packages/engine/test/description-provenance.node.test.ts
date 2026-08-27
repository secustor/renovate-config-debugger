/**
 * Unit tests for roadmap 069's positional walk, over hand-built preset trees.
 *
 * The shimmed suite proves the walk against Renovate's real presets; this one
 * isolates the individual rules — own-body-last ordering, two nodes writing
 * the identical sentence, the raw-string body, the drop rules, and the
 * enclosing-node fallback when a subtree's replay does not reproduce its own
 * ground-truth `resolved`. Everything here is pure data, so it runs in the
 * `golden` (unshimmed) project.
 */
import { describe, expect, it } from "vitest";
import {
  computeDescriptionProvenance,
  type DescriptionProvenance,
  type PresetNode,
  type TraceResult,
} from "../src/index";
import { must } from "./helpers";

interface NodeSpec {
  name: string;
  input: Record<string, unknown>;
  /** Own body + subtree, i.e. what merges into the parent. Defaults to a
   *  faithful replay of `children` then `input`, so a test only states it when
   *  it wants the ground truth to disagree with the replay. */
  resolved?: Record<string, unknown>;
  fetched?: Record<string, unknown>;
  children?: NodeSpec[];
}

let counter = 0;

function membersOf(value: unknown): unknown[] {
  if (typeof value === "string") {
    return [value];
  }
  return Array.isArray(value) ? value : [];
}

function descriptionsOf(body: Record<string, unknown> | undefined): string[] {
  return membersOf(body?.description).filter((v): v is string => typeof v === "string");
}

function build(spec: NodeSpec, id: string): PresetNode {
  const children = (spec.children ?? []).map((child) => build(child, `p${++counter}`));
  // Renovate's own order: children then own body, then `overrideDescription`
  // replacing the lot (members, so a non-string override member survives too).
  const override = membersOf(spec.input.overrideDescription);
  const replayed =
    override.length > 0
      ? override
      : [
          ...children.flatMap((c) => descriptionsOf(c.resolved as Record<string, unknown>)),
          ...descriptionsOf(spec.input),
        ];
  return {
    id,
    name: spec.name,
    state: "resolved",
    input: spec.input,
    resolved: spec.resolved ?? { description: replayed },
    ...(spec.fetched ? { fetched: spec.fetched } : {}),
    children,
  };
}

/** `finalDescription` overrides the array the run ended with — the only way to
 *  state a final array the replay cannot derive, e.g. one holding a non-string
 *  member (Renovate warns about those but keeps them). */
function traceResult(spec: NodeSpec, finalDescription?: unknown[]): TraceResult {
  counter = 0;
  const root = build(spec, "root");
  const resolved = root.resolved as Record<string, unknown>;
  return {
    events: [],
    finalConfig: { description: finalDescription ?? descriptionsOf(resolved) },
    errors: [],
    warnings: [],
    renovateVersion: "test",
    stageStatus: {
      global: "skipped",
      inherit: "skipped",
      parse: "ok",
      migrate: "ok",
      massage: "ok",
      validate: "ok",
      preset: "ok",
      merge: "ok",
    },
    visitedPresets: { merged: [], unmerged: [] },
    presetTree: root,
    platformContext: { platform: "github", endpoint: "https://api.github.com/" },
    usedInjections: [],
  };
}

function provenance(spec: NodeSpec): DescriptionProvenance {
  return must(computeDescriptionProvenance(traceResult(spec)), "the description provenance");
}

/** `[value, nodeName, topLevelLayer]` per entry — the whole attribution, terse. */
function shape(prov: DescriptionProvenance): [string, string | undefined, string][] {
  return prov.entries.map((entry) => [
    entry.value,
    entry.node?.name,
    entry.viaTopLevel.kind === "preset" ? entry.viaTopLevel.name : entry.viaTopLevel.kind,
  ]);
}

describe("computeDescriptionProvenance: the positional walk", () => {
  it("merges children in extends order and the node's own body last, at every depth", () => {
    const prov = provenance({
      name: "(input config)",
      input: { description: ["mine"] },
      children: [
        {
          name: "a",
          input: { description: ["a-own"] },
          children: [{ name: "a-child", input: { description: ["a-child-own"] } }],
        },
        { name: "b", input: { description: ["b-own"] } },
      ],
    });
    expect(shape(prov)).toEqual([
      ["a-child-own", "a-child", "a"],
      ["a-own", "a", "a"],
      ["b-own", "b", "b"],
      ["mine", "(input config)", "repo"],
    ]);
    expect(prov.degraded).toBe(false);
  });

  it("attributes identical strings to their own nodes, not to the first match", () => {
    const prov = provenance({
      name: "(input config)",
      input: {},
      children: [
        { name: "a", input: { description: ["same"] } },
        { name: "b", input: { description: ["same"] } },
      ],
    });
    expect(shape(prov)).toEqual([
      ["same", "a", "a"],
      ["same", "b", "b"],
    ]);
    expect(prov.entries[0]?.duplicateOfIndex).toBeUndefined();
    expect(prov.entries[1]?.duplicateOfIndex).toBe(0);
  });

  it("accepts a raw string description (allowString) as a one-element array", () => {
    const prov = provenance({
      name: "(input config)",
      input: { description: "own string" },
      children: [{ name: "a", input: { description: "child string" } }],
    });
    expect(shape(prov)).toEqual([
      ["child string", "a", "a"],
      ["own string", "(input config)", "repo"],
    ]);
    expect(prov.degraded).toBe(false);
  });

  it("falls back to the enclosing node when a subtree's replay contradicts its resolved body", () => {
    const prov = provenance({
      name: "(input config)",
      input: {},
      children: [
        {
          name: "a",
          input: { description: ["a-own"] },
          // ground truth disagrees with the replay (a hypothetical unmodelled
          // drop/reorder inside `a`) — attribute the subtree, not a leaf
          resolved: { description: ["surprise", "a-own"] },
          children: [{ name: "a-child", input: { description: ["a-child-own"] } }],
        },
        { name: "b", input: { description: ["b-own"] } },
      ],
    });
    expect(shape(prov)).toEqual([
      ["surprise", "a", "a"],
      ["a-own", "a", "a"],
      ["b-own", "b", "b"],
    ]);
    expect(prov.degraded).toBe(true);
    // only the contradicting subtree is degraded; `b` keeps its exact attribution
    expect(prov.entries.map((e) => e.approximate)).toEqual([true, true, undefined]);
  });

  it("indexes against the REAL final array, listing its non-string members apart", () => {
    // Renovate only warns about `{"description": ["a", 42]}`, so the 42 reaches
    // the final array and holds index 1 — everything after it must say 2, not 1.
    const result = traceResult(
      {
        name: "(input config)",
        input: { description: ["mine", 42] },
        children: [{ name: "a", input: { description: ["a-own"] } }],
      },
      ["a-own", 42, "mine"],
    );
    const prov = must(computeDescriptionProvenance(result), "the description provenance");
    expect(prov.entries.map((e) => [e.index, e.value, e.node?.name])).toEqual([
      [0, "a-own", "a"],
      [2, "mine", "(input config)"],
    ]);
    expect(prov.unattributed).toEqual([{ index: 1, value: 42 }]);
    expect(prov.finalLength).toBe(3);
    // the strings still replay exactly, so nothing is approximate
    expect(prov.degraded).toBe(false);
    expect(prov.entries.some((e) => e.approximate)).toBe(false);
  });

  it("skips nested and unresolved children, which never merged", () => {
    const spec: NodeSpec = {
      name: "(input config)",
      input: {},
      children: [{ name: "a", input: { description: ["a-own"] } }],
    };
    const result = traceResult(spec);
    const root = must(result.presetTree, "the preset tree");
    root.children.push(
      {
        id: "n1",
        name: "nested",
        state: "resolved",
        nested: true,
        resolved: { description: ["x"] },
        input: { description: ["x"] },
        children: [],
      },
      { id: "n2", name: "broken", state: "error", children: [] },
    );
    const prov = must(computeDescriptionProvenance(result), "the description provenance");
    expect(prov.entries.map((e) => e.value)).toEqual(["a-own"]);
    expect(prov.degraded).toBe(false);
  });
});

describe("computeDescriptionProvenance: the drop rules", () => {
  it("reports a `{description, extends}` wrapper preset's own deleted description", () => {
    const prov = provenance({
      name: "(input config)",
      input: {},
      children: [
        {
          name: "org/wrapper",
          fetched: { description: "Our org standard.", extends: ["a"] },
          input: { extends: ["a"] },
          children: [{ name: "a", input: { description: ["a-own"] } }],
        },
      ],
    });
    expect(prov.entries.map((e) => e.value)).toEqual(["a-own"]);
    expect(prov.dropped).toEqual([
      {
        value: "Our org standard.",
        node: { nodeId: "p1", name: "org/wrapper" },
        reason: "wrapper-preset",
      },
    ]);
  });

  it("reports a `{description, matchPackageNames}` package-list preset's deleted description", () => {
    const prov = provenance({
      name: "(input config)",
      input: {},
      children: [
        {
          name: "org/list",
          fetched: { description: "Just a list.", matchPackageNames: ["left-pad"] },
          input: { matchPackageNames: ["left-pad"] },
        },
      ],
    });
    expect(prov.entries).toEqual([]);
    expect(prov.dropped.map((d) => [d.value, d.reason])).toEqual([
      ["Just a list.", "package-list-preset"],
    ]);
  });

  it("leaves a preset that kept its description alone, whatever its fetched shape", () => {
    const prov = provenance({
      name: "(input config)",
      input: {},
      children: [
        {
          name: "org/kept",
          fetched: { description: "Kept.", extends: ["a"], automerge: true },
          input: { description: ["Kept."], extends: ["a"], automerge: true },
        },
      ],
    });
    expect(prov.entries.map((e) => e.value)).toEqual(["Kept."]);
    expect(prov.dropped).toEqual([]);
  });

  it("reports every description an `overrideDescription` replaced, per authoring node", () => {
    const prov = provenance({
      name: "(input config)",
      input: {},
      children: [
        {
          name: "muter",
          input: { description: ["muter-own"], overrideDescription: ["one line"] },
          children: [
            {
              name: "a",
              input: { description: ["a-own"] },
              children: [{ name: "a-child", input: { description: ["a-child-own"] } }],
            },
          ],
        },
      ],
    });
    // the override replaces the WHOLE resolved description — the subtree's
    // sentences and the overriding node's own — and is owned by that node
    expect(shape(prov)).toEqual([["one line", "muter", "muter"]]);
    expect(prov.dropped).toEqual([
      {
        value: "a-child-own",
        node: { nodeId: "p3", name: "a-child" },
        reason: "description-override",
        droppedBy: { nodeId: "p1", name: "muter" },
      },
      {
        value: "a-own",
        node: { nodeId: "p2", name: "a" },
        reason: "description-override",
        droppedBy: { nodeId: "p1", name: "muter" },
      },
      {
        value: "muter-own",
        node: { nodeId: "p1", name: "muter" },
        reason: "description-override",
        droppedBy: { nodeId: "p1", name: "muter" },
      },
    ]);
    expect(prov.degraded).toBe(false);
  });

  it("ignores an empty `overrideDescription`, as Renovate's length guard does", () => {
    const prov = provenance({
      name: "(input config)",
      input: {},
      children: [
        {
          name: "not-a-muter",
          input: { description: ["own"], overrideDescription: [] },
          children: [{ name: "a", input: { description: ["a-own"] } }],
        },
      ],
    });
    expect(shape(prov)).toEqual([
      ["a-own", "a", "not-a-muter"],
      ["own", "not-a-muter", "not-a-muter"],
    ]);
    expect(prov.dropped).toEqual([]);
  });

  it("keeps an overridden subtree's guessed author labelled as a guess", () => {
    const prov = provenance({
      name: "(input config)",
      input: {},
      children: [
        {
          name: "muter",
          input: { overrideDescription: ["one line"] },
          children: [
            {
              name: "a",
              input: { description: ["a-own"] },
              // contradicts the replay, so `a`'s subtree degrades to `a` …
              resolved: { description: ["surprise"] },
              children: [{ name: "a-child", input: { description: ["a-child-own"] } }],
            },
          ],
        },
      ],
    });
    // … and the override then diverts that guess into `dropped`, still labelled
    expect(prov.dropped).toEqual([
      {
        value: "surprise",
        node: { nodeId: "p2", name: "a" },
        reason: "description-override",
        droppedBy: { nodeId: "p1", name: "muter" },
        approximate: true,
      },
    ]);
    expect(shape(prov)).toEqual([["one line", "muter", "muter"]]);
    expect(prov.degraded).toBe(true);
  });

  it("applies an `overrideDescription` at the repo level too, in its `allowString` form", () => {
    const prov = provenance({
      name: "(input config)",
      input: { description: ["mine"], overrideDescription: "what this config does" },
      children: [{ name: "a", input: { description: ["a-own"] } }],
    });
    // the root wrote the override, so it arrives through the `repo` layer
    expect(shape(prov)).toEqual([["what this config does", "(input config)", "repo"]]);
    expect(prov.dropped.map((d) => [d.value, d.node.name, d.droppedBy?.nodeId])).toEqual([
      ["a-own", "a", "root"],
      ["mine", "(input config)", "root"],
    ]);
  });

  it("counts a non-string override member as a real position, attributed to nobody", () => {
    // `overrideDescription` is `subType: "string"`, but a wrong-typed member is
    // a warning, not a refusal — and it becomes a member of `description`.
    const result = traceResult(
      {
        name: "(input config)",
        input: { overrideDescription: ["kept", 42] },
        children: [{ name: "a", input: { description: ["a-own"] } }],
      },
      ["kept", 42],
    );
    const prov = must(computeDescriptionProvenance(result), "the description provenance");
    expect(shape(prov)).toEqual([["kept", "(input config)", "repo"]]);
    expect(prov.unattributed).toEqual([{ index: 1, value: 42 }]);
    expect(prov.finalLength).toBe(2);
    expect(prov.degraded).toBe(false);
  });
});

describe("computeDescriptionProvenance: availability", () => {
  it("returns undefined without a preset tree", () => {
    const result = traceResult({ name: "(input config)", input: {} });
    expect(computeDescriptionProvenance({ ...result, presetTree: undefined })).toBeUndefined();
    expect(computeDescriptionProvenance({ ...result, finalConfig: undefined })).toBeUndefined();
  });

  it("returns an empty attribution when nothing describes anything", () => {
    const prov = provenance({ name: "(input config)", input: { automerge: true } });
    expect(prov).toEqual({
      entries: [],
      unattributed: [],
      finalLength: 0,
      dropped: [],
      ruleDescriptions: [],
      degraded: false,
    });
  });
});
