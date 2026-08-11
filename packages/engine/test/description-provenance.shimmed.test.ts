/**
 * Shimmed-project tests for roadmap 069 per-string `description` provenance.
 *
 * Runs against Renovate's own INTERNAL presets (no network, no injection): the
 * point of this suite is that the positional replay survives a real, deep
 * preset tree — `config:best-practices` alone expands to a four-level chain
 * whose top-level `description` ends up 20+ strings long — and that the
 * hand-derived facts about it (leaf attributions, duplicates from re-extending
 * an already-merged preset, wrapper-preset drops) come out exactly.
 */
import { describe, expect, it } from "vitest";
import {
  computeDescriptionProvenance,
  type DescriptionAttribution,
  type DescriptionProvenance,
  runPipeline,
  type TraceResult,
} from "../src/index";
import { must } from "./helpers";

const repoConfig = JSON.stringify({
  extends: ["config:best-practices", ":dependencyDashboard", "group:monorepos"],
});

const DEPENDENCY_DASHBOARD = "Enable Renovate Dependency Dashboard creation.";
const MONOREPOS = "Group known monorepo packages together.";
const PIN_DOCKER = "Pin Docker digests.";
const SEMANTIC_COMMITS =
  "Use semantic commit type `fix` for dependencies and `chore` for all others if semantic commits are in use.";

async function runResult(content: string): Promise<TraceResult> {
  const result = await runPipeline({ fileName: "renovate.json", content });
  expect(result.stageStatus.preset).toBe("ok");
  return result;
}

async function attribution(): Promise<{ result: TraceResult; prov: DescriptionProvenance }> {
  const result = await runResult(repoConfig);
  const prov = must(computeDescriptionProvenance(result), "the description provenance");
  return { result, prov };
}

/** Terse label for an entry's top-level layer, mirroring the provenance tests. */
function via(entry: DescriptionAttribution): string {
  return entry.viaTopLevel.kind === "preset" ? entry.viaTopLevel.name : entry.viaTopLevel.kind;
}

describe("computeDescriptionProvenance (069)", () => {
  it("attributes every string of the final description array, in order", async () => {
    const { result, prov } = await attribution();
    const final = result.finalConfig?.description as string[];
    expect(final.length).toBeGreaterThan(20);
    expect(prov.entries.map((e) => e.value)).toEqual(final);
    expect(prov.entries.map((e) => e.index)).toEqual(final.map((_, i) => i));
    // the real tree replays exactly — no enclosing-node fallback needed
    expect(prov.degraded).toBe(false);
    expect(prov.entries.every((e) => e.node !== undefined)).toBe(true);
    expect(prov.entries.some((e) => e.approximate)).toBe(false);
  });

  it("attributes leaf strings to the preset that actually wrote them", async () => {
    const { prov } = await attribution();
    const docker = must(
      prov.entries.find((e) => e.value === PIN_DOCKER),
      `the "${PIN_DOCKER}" entry`,
    );
    expect(docker.node?.name).toBe("docker:pinDigests");
    // it arrived through the first top-level extend, four levels down
    expect(via(docker)).toBe("config:best-practices");

    const semantic = must(
      prov.entries.find((e) => e.value === SEMANTIC_COMMITS),
      "the semantic-commit entry",
    );
    expect(semantic.node?.name).toBe(":semanticPrefixFixDepsChoreOthers");
    expect(via(semantic)).toBe("config:best-practices");
  });

  it("marks the two re-extended presets as duplicates of their first occurrence", async () => {
    const { prov } = await attribution();
    const dashboard = prov.entries.filter((e) => e.value === DEPENDENCY_DASHBOARD);
    expect(dashboard).toHaveLength(2);
    expect(dashboard[0]?.duplicateOfIndex).toBeUndefined();
    expect(via(must(dashboard[0], "the first dashboard entry"))).toBe("config:best-practices");
    const dashboardRepeat = must(dashboard[1], "the repeated dashboard entry");
    expect(dashboardRepeat.duplicateOfIndex).toBe(dashboard[0]?.index);
    expect(via(dashboardRepeat)).toBe(":dependencyDashboard");
    expect(dashboardRepeat.node?.name).toBe(":dependencyDashboard");

    const monorepos = prov.entries.filter((e) => e.value === MONOREPOS);
    expect(monorepos).toHaveLength(2);
    expect(via(must(monorepos[0], "the first monorepos entry"))).toBe("config:best-practices");
    const monoreposRepeat = must(monorepos[1], "the repeated monorepos entry");
    expect(monoreposRepeat.duplicateOfIndex).toBe(monorepos[0]?.index);
    expect(via(monoreposRepeat)).toBe("group:monorepos");
    // the repeats are the last two entries: they arrive through the 2nd and 3rd extend
    expect([dashboardRepeat.index, monoreposRepeat.index]).toEqual([
      prov.entries.length - 2,
      prov.entries.length - 1,
    ]);
  });

  it("reports the wrapper presets whose own description Renovate deleted", async () => {
    const { prov } = await attribution();
    const wrapper = must(
      prov.dropped.find((d) => d.node.name === "config:best-practices"),
      "the config:best-practices drop",
    );
    expect(wrapper.reason).toBe("wrapper-preset");
    expect(wrapper.value).toContain("best practices from the Renovate maintainers");
    expect(wrapper.droppedBy).toBeUndefined();
    // and its own `{description, extends}` wrapper child too
    expect(
      prov.dropped.filter((d) => d.reason === "wrapper-preset").map((d) => d.node.name),
    ).toContain("config:recommended");
    // nothing dropped ever reaches the final array
    const values = new Set(prov.entries.map((e) => e.value));
    expect(prov.dropped.some((d) => values.has(d.value))).toBe(false);
  });

  it("reports the descriptions group:recommended's `ignoreDeps: []` silently deletes", async () => {
    const { prov } = await attribution();
    const quirk = prov.dropped.filter((d) => d.reason === "ignore-deps-quirk");
    // group:recommended carries `ignoreDeps: []`, which deletes the resolved
    // description of every one of its ~130 sub-groups — and it is not alone:
    // `replacements:all` and `workarounds:all` use the same trick to keep
    // their hundreds of member presets out of the top-level description.
    expect(quirk.length).toBeGreaterThan(100);
    expect(new Set(quirk.map((d) => d.droppedBy?.name))).toEqual(
      new Set(["group:recommended", "replacements:all", "workarounds:all"]),
    );
    const nodeJs = must(
      quirk.find((d) => d.node.name === "group:nodeJs"),
      "the group:nodeJs drop",
    );
    expect(nodeJs.value).toContain("Node.js");
  });

  it("finds the same drops on a repeated run, despite Renovate mutating its own preset table", async () => {
    // `internal/index.js` hands out the module-level preset objects by
    // reference, so `getPreset`'s `delete presetConfig.description` strips
    // `config:best-practices` for the rest of the process — every run after
    // the first sees a `fetched` body that never had a description.
    const first = must(computeDescriptionProvenance(await runResult(repoConfig)), "run 1");
    const second = must(computeDescriptionProvenance(await runResult(repoConfig)), "run 2");
    expect(second.dropped.map((d) => [d.node.name, d.reason, d.value])).toEqual(
      first.dropped.map((d) => [d.node.name, d.reason, d.value]),
    );
    expect(second.entries).toEqual(first.entries);
  });

  it("attributes packageRules descriptions to their contributing layer", async () => {
    const { result, prov } = await attribution();
    const rules = result.finalConfig?.packageRules as Record<string, unknown>[];
    expect(prov.ruleDescriptions.length).toBeGreaterThan(0);
    for (const entry of prov.ruleDescriptions) {
      expect(rules[entry.ruleIndex]?.description).toBeDefined();
      expect(entry.values.length).toBeGreaterThan(0);
    }
  });

  it("returns an empty attribution for a config with no descriptions anywhere", async () => {
    const result = await runResult(JSON.stringify({ automerge: true }));
    const prov = must(computeDescriptionProvenance(result), "the description provenance");
    expect(prov.entries).toEqual([]);
    expect(prov.dropped).toEqual([]);
    expect(prov.degraded).toBe(false);
  });

  it("attributes a repo config's own description to the root node", async () => {
    const result = await runResult(
      JSON.stringify({ description: "Our house rules.", extends: [":dependencyDashboard"] }),
    );
    const prov = must(computeDescriptionProvenance(result), "the description provenance");
    // preset first, own body last — Renovate's merge order
    expect(prov.entries.map((e) => [e.value, via(e)])).toEqual([
      [DEPENDENCY_DASHBOARD, ":dependencyDashboard"],
      ["Our house rules.", "repo"],
    ]);
    expect(prov.entries[1]?.node?.nodeId).toBe("root");
  });

  it("returns undefined when preset resolution did not complete", async () => {
    const result = await runPipeline({
      fileName: "renovate.json",
      content: JSON.stringify({ extends: ["github>test-org/does-not-resolve"] }),
    });
    expect(result.stageStatus.preset).toBe("error");
    expect(computeDescriptionProvenance(result)).toBeUndefined();
  });
});
