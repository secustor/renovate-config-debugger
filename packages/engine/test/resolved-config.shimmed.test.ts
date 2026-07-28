/**
 * Shimmed-project tests for roadmap 051 resolved-config output. Injected
 * github presets stand in for hosted ("fetched") presets; internal presets
 * resolve offline from Renovate's own bundle, so the round-trip assertions —
 * re-running the pipeline on the emitted document — need no network.
 */
import { describe, expect, it } from "vitest";
import {
  computeResolvedConfig,
  presetInjectionKey,
  type ResolvedConfigOutput,
  runPipeline,
  type TraceResult,
} from "../src/index";
import { must } from "./helpers";

const injectedPresets = {
  [presetInjectionKey({ presetSource: "github", repo: "test-org/preset-a" })]: {
    rangeStrategy: "bump",
    addLabels: ["a"],
    packageRules: [{ matchPackageNames: ["left-pad"], enabled: false }],
  },
  [presetInjectionKey({ presetSource: "github", repo: "test-org/sets-automerge" })]: {
    automerge: true,
  },
};

async function run(content: Record<string, unknown>): Promise<TraceResult> {
  const result = await runPipeline({
    fileName: "renovate.json",
    content: JSON.stringify(content),
    injectedPresets,
  });
  expect(result.stageStatus.preset).toBe("ok");
  return result;
}

function keepInternal(result: TraceResult): ResolvedConfigOutput {
  return must(
    computeResolvedConfig(result, "keep-internal"),
    "a keep-internal resolved config for a completed run",
  );
}

describe("computeResolvedConfig — keep-internal", () => {
  const repoConfig = {
    extends: [":dependencyDashboard", "github>test-org/preset-a"],
    automerge: false,
    packageRules: [{ matchDepTypes: ["devDependencies"], addLabels: ["dev"] }],
  };

  it("keeps internal presets referenced and inlines the fetched preset", async () => {
    const out = keepInternal(await run(repoConfig));
    expect(out.config.extends).toEqual([":dependencyDashboard"]);
    // preset-a's contribution is now part of the body…
    expect(out.config.rangeStrategy).toBe("bump");
    expect(out.config.addLabels).toEqual(["a"]);
    // …its rules concatenated before the repo's own, as the traced merge did
    expect(out.config.packageRules).toEqual([
      { matchPackageNames: ["left-pad"], enabled: false },
      { matchDepTypes: ["devDependencies"], addLabels: ["dev"] },
    ]);
    // repo body survives, dependencyDashboard is NOT inlined
    expect(out.config.automerge).toBe(false);
    expect(out.config).not.toHaveProperty("dependencyDashboard");
  });

  it("round-trips: re-running the pipeline on the emitted document reproduces the effective config", async () => {
    const original = await run(repoConfig);
    const out = keepInternal(original);
    expect(out.divergingKeys).toEqual([]);
    const rerun = await runPipeline({
      fileName: "renovate.json",
      content: JSON.stringify(out.config),
      injectedPresets,
    });
    expect(rerun.stageStatus.preset).toBe("ok");
    expect(rerun.finalConfig).toEqual(original.finalConfig);
  });

  it("reports keys whose value flips when a kept reference merged after inlined content", async () => {
    // Traced order: sets-automerge (true), then :automergeDisabled (false) →
    // false wins. The emitted document must resolve the kept reference FIRST,
    // so the inlined `automerge: true` would win instead — a real divergence.
    const original = await run({
      extends: ["github>test-org/sets-automerge", ":automergeDisabled"],
    });
    expect(original.finalConfig?.automerge).toBe(false);
    const out = keepInternal(original);
    expect(out.config.extends).toEqual([":automergeDisabled"]);
    expect(out.config.automerge).toBe(true);
    expect(out.divergingKeys).toEqual(["automerge"]);
    // and the divergence is real: the re-run flips the key
    const rerun = await runPipeline({
      fileName: "renovate.json",
      content: JSON.stringify(out.config),
      injectedPresets,
    });
    expect(rerun.finalConfig?.automerge).toBe(true);
  });

  it("emits no extends key when every preset was inlined", async () => {
    const out = keepInternal(await run({ extends: ["github>test-org/preset-a"] }));
    expect(out.config).not.toHaveProperty("extends");
    expect(out.config.rangeStrategy).toBe("bump");
    expect(out.divergingKeys).toEqual([]);
  });

  it("keeps an ignored preset referenced alongside its ignorePresets entry", async () => {
    const out = keepInternal(
      await run({
        extends: [":dependencyDashboard"],
        ignorePresets: [":dependencyDashboard"],
        automerge: false,
      }),
    );
    expect(out.config.extends).toEqual([":dependencyDashboard"]);
    expect(out.config.ignorePresets).toEqual([":dependencyDashboard"]);
    expect(out.config).not.toHaveProperty("dependencyDashboard");
  });

  it("preserves nested extends in the repo body as written", async () => {
    const out = keepInternal(
      await run({
        packageRules: [{ matchDepTypes: ["devDependencies"], extends: [":automergeDisabled"] }],
      }),
    );
    const rules = out.config.packageRules as Record<string, unknown>[];
    expect(rules[0]?.extends).toEqual([":automergeDisabled"]);
  });
});

describe("computeResolvedConfig — full", () => {
  it("returns the repo-level resolution with every preset inlined and no extends", async () => {
    const result = await run({
      extends: [":dependencyDashboard", "github>test-org/preset-a"],
      automerge: false,
    });
    const out = must(computeResolvedConfig(result, "full"), "a full resolved config");
    expect(out.config).not.toHaveProperty("extends");
    expect(out.config.dependencyDashboard).toBe(true);
    expect(out.config.rangeStrategy).toBe("bump");
    expect(out.config.automerge).toBe(false);
    expect(out.divergingKeys).toEqual([]);
    // without defaults: untouched default keys are absent
    expect(out.config).not.toHaveProperty("branchPrefix");
  });

  it("includeDefaults hydrates the defaults underneath the resolved keys", async () => {
    const result = await run({ extends: [":automergeDisabled"] });
    const bare = must(computeResolvedConfig(result, "full"), "a full resolved config");
    const hydrated = must(
      computeResolvedConfig(result, "full", { includeDefaults: true }),
      "a defaults-hydrated full resolved config",
    );
    // a pure default appears only in the hydrated document…
    expect(bare.config).not.toHaveProperty("branchPrefix");
    expect(hydrated.config.branchPrefix).toBe("renovate/");
    // …and the resolved value still wins over the default underneath
    expect(hydrated.config.automerge).toBe(false);
  });
});

describe("computeResolvedConfig — availability", () => {
  it("returns undefined when preset resolution did not complete", async () => {
    const result = await runPipeline({
      fileName: "renovate.json",
      content: JSON.stringify({ extends: ["github>test-org/does-not-resolve"] }),
    });
    expect(result.stageStatus.preset).toBe("error");
    expect(computeResolvedConfig(result, "keep-internal")).toBeUndefined();
    expect(computeResolvedConfig(result, "full")).toBeUndefined();
  });
});
