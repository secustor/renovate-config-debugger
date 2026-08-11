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

function descriptionsOf(body: Record<string, unknown> | undefined): string[] {
  const value = body?.description;
  if (typeof value === "string") {
    return [value];
  }
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function build(spec: NodeSpec, id: string): PresetNode {
  const children = (spec.children ?? []).map((child) => build(child, `p${++counter}`));
  const quirk = Array.isArray(spec.input.ignoreDeps) && spec.input.ignoreDeps.length === 0;
  const replayed = [
    ...(quirk
      ? []
      : children.flatMap((c) => descriptionsOf(c.resolved as Record<string, unknown>))),
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

  it("reports every description an extending `ignoreDeps: []` deleted, per authoring node", () => {
    const prov = provenance({
      name: "(input config)",
      input: {},
      children: [
        {
          name: "quirky",
          input: { description: ["quirky-own"], ignoreDeps: [] },
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
    // only the extending node's OWN description survives
    expect(shape(prov)).toEqual([["quirky-own", "quirky", "quirky"]]);
    expect(prov.dropped).toEqual([
      {
        value: "a-child-own",
        node: { nodeId: "p3", name: "a-child" },
        reason: "ignore-deps-quirk",
        droppedBy: { nodeId: "p1", name: "quirky" },
      },
      {
        value: "a-own",
        node: { nodeId: "p2", name: "a" },
        reason: "ignore-deps-quirk",
        droppedBy: { nodeId: "p1", name: "quirky" },
      },
    ]);
    expect(prov.degraded).toBe(false);
  });

  it("keeps a muted subtree's guessed author labelled as a guess", () => {
    const prov = provenance({
      name: "(input config)",
      input: {},
      children: [
        {
          name: "quirky",
          input: { ignoreDeps: [] },
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
    // … and the quirk then diverts that guess into `dropped`, still labelled
    expect(prov.dropped).toEqual([
      {
        value: "surprise",
        node: { nodeId: "p2", name: "a" },
        reason: "ignore-deps-quirk",
        droppedBy: { nodeId: "p1", name: "quirky" },
        approximate: true,
      },
    ]);
    expect(prov.entries).toEqual([]);
    expect(prov.degraded).toBe(true);
  });

  it("applies the `ignoreDeps: []` quirk at the repo level too", () => {
    const prov = provenance({
      name: "(input config)",
      input: { description: ["mine"], ignoreDeps: [] },
      children: [{ name: "a", input: { description: ["a-own"] } }],
    });
    expect(shape(prov)).toEqual([["mine", "(input config)", "repo"]]);
    expect(prov.dropped.map((d) => [d.value, d.droppedBy?.nodeId])).toEqual([["a-own", "root"]]);
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
