/**
 * Shimmed-project tests for roadmap 005 merge provenance. Uses in-memory
 * injected presets (no network) to build a config that exercises every merge
 * shape: preset-over-preset scalar overwrite, packageRules concat from
 * preset+repo, a repo key explicitly set to its default, an untouched default,
 * a repo packageRules[n].extends that triggers the nested-expansion correction,
 * and a force-carrying preset.
 */
import { describe, expect, it } from "vitest";
import {
  computeProvenance,
  computeRuleProvenance,
  type KeyProvenance,
  presetInjectionKey,
  type RuleAttribution,
  runPipeline,
  type TraceResult,
} from "../src/index";
import { must } from "./helpers";

const injectedPresets = {
  [presetInjectionKey({ presetSource: "github", repo: "test-org/preset-a" })]: {
    rangeStrategy: "bump",
    addLabels: ["a"],
    packageRules: [{ matchPackageNames: ["left-pad"], enabled: false }],
    force: { rebaseWhen: "behind-base-branch" },
  },
  [presetInjectionKey({ presetSource: "github", repo: "test-org/preset-b" })]: {
    rangeStrategy: "replace",
    addLabels: ["b"],
  },
  [presetInjectionKey({ presetSource: "github", repo: "test-org/nested-rule" })]: {
    enabled: false,
  },
  // A wrapper whose value is written two levels down — the writtenBy case.
  [presetInjectionKey({ presetSource: "github", repo: "test-org/wrapper" })]: {
    extends: ["github>test-org/deep"],
  },
  [presetInjectionKey({ presetSource: "github", repo: "test-org/deep" })]: {
    prCreation: "not-pending",
  },
};

const repoConfig = JSON.stringify({
  extends: ["github>test-org/preset-a", "github>test-org/preset-b", "github>test-org/wrapper"],
  automerge: false,
  packageRules: [{ matchDepTypes: ["devDependencies"], extends: ["github>test-org/nested-rule"] }],
});

async function runResult(): Promise<TraceResult> {
  const result = await runPipeline({
    fileName: "renovate.json",
    content: repoConfig,
    injectedPresets,
  });
  expect(result.stageStatus.preset).toBe("ok");
  return result;
}

async function provenance(): Promise<Map<string, KeyProvenance>> {
  const result = await runResult();
  const prov = computeProvenance(result);
  expect(prov).toBeDefined();
  return prov as Map<string, KeyProvenance>;
}

/** Layer label for a step, for terse assertions. */
function layerName(layer: KeyProvenance["chain"][number]["layer"]): string {
  return layer.kind === "preset" ? layer.name : layer.kind;
}

describe("computeProvenance", () => {
  it("(a) attributes a later preset overwriting an earlier preset's scalar", async () => {
    const prov = await provenance();
    const range = must(prov.get("rangeStrategy"), "the 'rangeStrategy' provenance entry");
    expect(range.finalValue).toBe("replace");
    expect(range.isDefaultOnly).toBe(false);
    const nonDefault = range.chain.filter((s) => s.layer.kind !== "defaults");
    expect(nonDefault.map((s) => [layerName(s.layer), s.action])).toEqual([
      ["github>test-org/preset-a", "set"],
      ["github>test-org/preset-b", "overwrite"],
    ]);
    // the overwrite records preset-a's losing value
    expect(nonDefault[1]?.before).toBe("bump");
    expect(nonDefault[1]?.after).toBe("replace");
  });

  it("(b) records packageRules concat from preset + repo", async () => {
    const prov = await provenance();
    const rules = must(prov.get("packageRules"), "the 'packageRules' provenance entry");
    const nonDefault = rules.chain.filter((s) => s.layer.kind !== "defaults");
    expect(nonDefault.map((s) => [layerName(s.layer), s.action])).toEqual([
      ["github>test-org/preset-a", "set"],
      ["repo", "concat"],
    ]);
    // addLabels (mergeable) concat across the two presets
    const labels = must(prov.get("addLabels"), "the 'addLabels' provenance entry");
    const labelSteps = labels.chain.filter((s) => s.layer.kind !== "defaults");
    expect(labelSteps.map((s) => s.action)).toEqual(["set", "concat"]);
    expect(labels.finalValue).toEqual(["a", "b"]);
  });

  it("(c) a repo key explicitly set to its default is not default-only", async () => {
    const prov = await provenance();
    const automerge = must(prov.get("automerge"), "the 'automerge' provenance entry");
    expect(automerge.finalValue).toBe(false);
    expect(automerge.isDefaultOnly).toBe(false);
    // the repo layer set it, atop a (no-op) defaults base
    expect(automerge.chain.some((s) => s.layer.kind === "repo" && s.action === "set")).toBe(true);
  });

  it("(d) an untouched key is default-only", async () => {
    const prov = await provenance();
    const branchPrefix = prov.get("branchPrefix");
    expect(branchPrefix).toBeDefined();
    expect(branchPrefix?.isDefaultOnly).toBe(true);
    expect(branchPrefix?.chain).toHaveLength(1);
    expect(branchPrefix?.chain[0]?.layer.kind).toBe("defaults");
  });

  it("(e) tags the nested-extends expansion on the repo packageRules step", async () => {
    const prov = await provenance();
    const rules = must(prov.get("packageRules"), "the 'packageRules' provenance entry");
    const repoStep = rules.chain.find((s) => s.layer.kind === "repo");
    expect(repoStep?.expandedNested).toBe(true);
    // the injected nested preset (enabled:false) is merged in, extends removed
    const finalRules = rules.finalValue as Record<string, unknown>[];
    const devRule = finalRules.find((r) => Array.isArray(r.matchDepTypes));
    expect(devRule).toMatchObject({ matchDepTypes: ["devDependencies"], enabled: false });
    expect(devRule).not.toHaveProperty("extends");
  });

  it("(f) attributes a force-sourced win to the preset that forced it", async () => {
    const prov = await provenance();
    const rebaseWhen = must(prov.get("rebaseWhen"), "the 'rebaseWhen' provenance entry");
    expect(rebaseWhen.finalValue).toBe("behind-base-branch");
    const forced = must(
      rebaseWhen.chain.find((s) => s.action === "forced"),
      "the 'forced' provenance step for rebaseWhen",
    );
    expect(layerName(forced.layer)).toBe("github>test-org/preset-a");
    // forced exactly once (deduped across the later layers that re-flatten force)
    expect(rebaseWhen.chain.filter((s) => s.action === "forced")).toHaveLength(1);
  });

  it("(g) names the nested preset that actually wrote a wrapped value", async () => {
    const prov = await provenance();
    const prCreation = must(prov.get("prCreation"), "the 'prCreation' provenance entry");
    const step = must(
      prCreation.chain.find((s) => s.layer.kind === "preset"),
      "the preset step for prCreation",
    );
    // The merge layer is the direct extend; the writer is the preset nested
    // inside it whose own body carries the key.
    expect(layerName(step.layer)).toBe("github>test-org/wrapper");
    expect(step.writtenBy?.name).toBe("github>test-org/deep");
    // A preset that writes its own key gets no writtenBy — the layer already
    // names it.
    const range = must(prov.get("rangeStrategy"), "the 'rangeStrategy' provenance entry");
    for (const s of range.chain) {
      expect(s.writtenBy).toBeUndefined();
    }
  });

  it("holds the round-trip property: every key's last step reproduces the final value", async () => {
    const prov = await provenance();
    for (const [key, entry] of prov) {
      const last = entry.chain.at(-1);
      expect(last, `chain for ${key} is empty`).toBeDefined();
      expect(last?.after, `round-trip mismatch for ${key}`).toEqual(entry.finalValue);
    }
  });

  it("returns undefined when preset resolution did not complete", async () => {
    const result = await runPipeline({
      fileName: "renovate.json",
      content: JSON.stringify({ extends: ["github>test-org/does-not-resolve"] }),
    });
    // no injection for this preset and no network → preset stage errors, root
    // has no resolved payload
    expect(result.stageStatus.preset).toBe("error");
    expect(computeProvenance(result)).toBeUndefined();
  });
});

/** Layer label for an attribution, for terse assertions (mirrors `layerName` above). */
function attrLayerName(attr: RuleAttribution): string {
  return attr.layer.kind === "preset" ? attr.layer.name : attr.layer.kind;
}

describe("computeRuleProvenance (013)", () => {
  it("attributes each merged packageRules index to its contributing layer + the index within that layer's own array", async () => {
    const result = await runResult();
    const attribution = computeRuleProvenance(result);
    expect(attribution).toBeDefined();
    const rules = attribution as RuleAttribution[];
    // merged order: preset-a's own rule first (it extends before the repo's
    // own packageRules), then the repo's own rule — matching (b) above.
    expect(rules.map((a) => [a.index, attrLayerName(a), a.sourceIndex])).toEqual([
      [0, "github>test-org/preset-a", 0],
      [1, "repo", 0],
    ]);
  });

  it("agrees with the final merged config's length and the nested-extends-corrected rule content", async () => {
    const result = await runResult();
    const attribution = computeRuleProvenance(result) as RuleAttribution[];
    const finalRules = result.finalConfig?.packageRules as Record<string, unknown>[];
    expect(attribution).toHaveLength(finalRules.length);
    // the repo-attributed entry is the nested-extends-expanded rule (enabled:false
    // merged in from the injected nested preset, per provenance test (e) above).
    const repoEntry = must(
      attribution.find((a) => a.layer.kind === "repo"),
      "the repo-attributed rule entry",
    );
    expect(finalRules[repoEntry.index]).toMatchObject({
      matchDepTypes: ["devDependencies"],
      enabled: false,
    });
  });

  it("a repo-config index round-trips to the same rule a validator message about it would name", async () => {
    // Validation runs BEFORE preset merge, against the repo's own directly-authored
    // packageRules array — so a message like `packageRules[0]` names sourceIndex 0
    // of the "repo" layer, i.e. the same array JSON.parse(repoConfig).packageRules is.
    const repoOwnRules = (JSON.parse(repoConfig) as { packageRules: unknown[] }).packageRules;
    const result = await runResult();
    const attribution = computeRuleProvenance(result) as RuleAttribution[];
    for (const [sourceIndex] of repoOwnRules.entries()) {
      const entry = attribution.find(
        (a) => a.layer.kind === "repo" && a.sourceIndex === sourceIndex,
      );
      expect(entry, `no attribution for repo-config index ${sourceIndex}`).toBeDefined();
    }
  });

  it("returns an empty array when the merged config has no packageRules", async () => {
    const result = await runPipeline({
      fileName: "renovate.json",
      content: JSON.stringify({ automerge: true }),
    });
    expect(result.stageStatus.preset).toBe("ok");
    expect(computeRuleProvenance(result)).toEqual([]);
  });

  it("returns undefined when preset resolution did not complete", async () => {
    const result = await runPipeline({
      fileName: "renovate.json",
      content: JSON.stringify({ extends: ["github>test-org/does-not-resolve"] }),
    });
    expect(result.stageStatus.preset).toBe("error");
    expect(computeRuleProvenance(result)).toBeUndefined();
  });
});

/**
 * The nested half of 013: which BODY inside a direct extend's subtree wrote a
 * merged rule. `config:best-practices` contributes all ~730 rules of a real run
 * and authors none of them, so a layer-only attribution names a preset that
 * wrote nothing — the asymmetry `ProvenanceStep.writtenBy` already fixed for
 * scalar keys.
 */
const leafTwoRules = [
  { matchPackageNames: ["two-a"], automerge: true },
  { matchPackageNames: ["two-b"], automerge: true },
];

const nestedPresets = {
  // The direct extend: two nested bodies, then two rules of its own.
  [presetInjectionKey({ presetSource: "github", repo: "test-org/umbrella" })]: {
    extends: ["github>test-org/leaf-one", "github>test-org/leaf-two"],
    packageRules: [
      { matchPackageNames: ["own-a"], enabled: false },
      { matchPackageNames: ["own-b"], enabled: false },
    ],
  },
  [presetInjectionKey({ presetSource: "github", repo: "test-org/leaf-one" })]: {
    packageRules: [{ matchPackageNames: ["one-a"], automerge: true }],
  },
  [presetInjectionKey({ presetSource: "github", repo: "test-org/leaf-two" })]: {
    packageRules: leafTwoRules,
  },
};

async function nestedAttribution(content: string): Promise<RuleAttribution[]> {
  const result = await runPipeline({
    fileName: "renovate.json",
    content,
    injectedPresets: nestedPresets,
  });
  expect(result.stageStatus.preset).toBe("ok");
  return must(computeRuleProvenance(result), "the rule attribution");
}

/** `<writer>[<index in that writer>]`, or `-` for a rule with no nested writer. */
function writerRef(attr: RuleAttribution): string {
  return attr.writtenBy ? `${attr.writtenBy.name}[${attr.writtenBy.sourceIndex}]` : "-";
}

describe("computeRuleProvenance nested writers", () => {
  it("names the nested body that wrote each rule, with the index it has THERE", async () => {
    const attribution = await nestedAttribution(
      JSON.stringify({
        extends: ["github>test-org/umbrella"],
        packageRules: [{ matchPackageNames: ["mine"], enabled: false }],
      }),
    );
    // Resolution order is children first, the node's own body last — the order
    // `mergeChildConfig` concatenates in — so the merged array tiles as
    // leaf-one, leaf-two, umbrella's own, then the repo's own.
    expect(
      attribution.map((a) => [a.index, attrLayerName(a), a.sourceIndex, writerRef(a)]),
    ).toEqual([
      [0, "github>test-org/umbrella", 0, "github>test-org/leaf-one[0]"],
      [1, "github>test-org/umbrella", 1, "github>test-org/leaf-two[0]"],
      [2, "github>test-org/umbrella", 2, "github>test-org/leaf-two[1]"],
      // The direct extend's own rules carry no writer: naming it again is
      // exactly what `layer` already says.
      [3, "github>test-org/umbrella", 3, "-"],
      [4, "github>test-org/umbrella", 4, "-"],
      [5, "repo", 0, "-"],
    ]);
  });

  it("the writer's own index points at the rule a reader would find in that preset", async () => {
    const attribution = await nestedAttribution(
      JSON.stringify({ extends: ["github>test-org/umbrella"] }),
    );
    const twoB = must(
      attribution.find((a) => writerRef(a) === "github>test-org/leaf-two[1]"),
      "the leaf-two[1] attribution",
    );
    expect(leafTwoRules[twoB.writtenBy?.sourceIndex ?? -1]).toMatchObject({
      matchPackageNames: ["two-b"],
    });
  });

  it("reports no writer when the extend's own rules are all it has", async () => {
    const attribution = await nestedAttribution(
      JSON.stringify({ extends: ["github>test-org/leaf-one"] }),
    );
    expect(attribution.map(writerRef)).toEqual(["-"]);
  });

  it("leaves the repo layer alone — it has no subtree to descend into", async () => {
    const attribution = await nestedAttribution(
      JSON.stringify({ packageRules: [{ matchPackageNames: ["mine"], enabled: false }] }),
    );
    expect(attribution).toEqual([{ index: 0, layer: { kind: "repo" }, sourceIndex: 0 }]);
  });
});
