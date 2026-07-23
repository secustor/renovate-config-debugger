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
  type KeyProvenance,
  presetInjectionKey,
  runPipeline,
} from "../src/index";

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
};

const repoConfig = JSON.stringify({
  extends: ["github>test-org/preset-a", "github>test-org/preset-b"],
  automerge: false,
  packageRules: [{ matchDepTypes: ["devDependencies"], extends: ["github>test-org/nested-rule"] }],
});

async function provenance(): Promise<Map<string, KeyProvenance>> {
  const result = await runPipeline({
    fileName: "renovate.json",
    content: repoConfig,
    injectedPresets,
  });
  expect(result.stageStatus.preset).toBe("ok");
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
    const range = prov.get("rangeStrategy");
    expect(range).toBeDefined();
    expect(range?.finalValue).toBe("replace");
    expect(range?.isDefaultOnly).toBe(false);
    const nonDefault = range!.chain.filter((s) => s.layer.kind !== "defaults");
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
    const rules = prov.get("packageRules");
    expect(rules).toBeDefined();
    const nonDefault = rules!.chain.filter((s) => s.layer.kind !== "defaults");
    expect(nonDefault.map((s) => [layerName(s.layer), s.action])).toEqual([
      ["github>test-org/preset-a", "set"],
      ["repo", "concat"],
    ]);
    // addLabels (mergeable) concat across the two presets
    const labels = prov.get("addLabels");
    const labelSteps = labels!.chain.filter((s) => s.layer.kind !== "defaults");
    expect(labelSteps.map((s) => s.action)).toEqual(["set", "concat"]);
    expect(labels?.finalValue).toEqual(["a", "b"]);
  });

  it("(c) a repo key explicitly set to its default is not default-only", async () => {
    const prov = await provenance();
    const automerge = prov.get("automerge");
    expect(automerge).toBeDefined();
    expect(automerge?.finalValue).toBe(false);
    expect(automerge?.isDefaultOnly).toBe(false);
    // the repo layer set it, atop a (no-op) defaults base
    expect(automerge!.chain.some((s) => s.layer.kind === "repo" && s.action === "set")).toBe(true);
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
    const rules = prov.get("packageRules");
    const repoStep = rules!.chain.find((s) => s.layer.kind === "repo");
    expect(repoStep?.expandedNested).toBe(true);
    // the injected nested preset (enabled:false) is merged in, extends removed
    const finalRules = rules?.finalValue as Record<string, unknown>[];
    const devRule = finalRules.find((r) => Array.isArray(r.matchDepTypes));
    expect(devRule).toMatchObject({ matchDepTypes: ["devDependencies"], enabled: false });
    expect(devRule).not.toHaveProperty("extends");
  });

  it("(f) attributes a force-sourced win to the preset that forced it", async () => {
    const prov = await provenance();
    const rebaseWhen = prov.get("rebaseWhen");
    expect(rebaseWhen).toBeDefined();
    expect(rebaseWhen?.finalValue).toBe("behind-base-branch");
    const forced = rebaseWhen!.chain.find((s) => s.action === "forced");
    expect(forced).toBeDefined();
    expect(layerName(forced!.layer)).toBe("github>test-org/preset-a");
    // forced exactly once (deduped across the later layers that re-flatten force)
    expect(rebaseWhen!.chain.filter((s) => s.action === "forced")).toHaveLength(1);
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
