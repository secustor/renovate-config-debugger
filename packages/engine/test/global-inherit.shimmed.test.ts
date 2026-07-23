/**
 * Shimmed-project tests for roadmap 008 global + inherited config layers.
 * Uses in-memory injected presets (no network) so `globalExtends` and the
 * inherited config's `extends` resolve deterministically. Covers the merge
 * precedence (defaults < globalExtends < global < inherited < repo), the
 * global-only boundary in repo/inherited configs, provenance layer steps, and
 * that absent layers keep the pipeline byte-identical to a plain run.
 */
import { describe, expect, it } from "vitest";
import {
  computeProvenance,
  type KeyProvenance,
  presetInjectionKey,
  runPipeline,
} from "../src/index";

const injectedPresets = {
  [presetInjectionKey({ presetSource: "github", repo: "test-org/global-preset" })]: {
    rangeStrategy: "widen",
    addLabels: ["from-global-extends"],
    prHourlyLimit: 7,
  },
  [presetInjectionKey({ presetSource: "github", repo: "test-org/inherited-preset" })]: {
    addLabels: ["from-inherited-preset"],
    prConcurrentLimit: 3,
  },
  [presetInjectionKey({ presetSource: "github", repo: "test-org/repo-preset" })]: {
    minimumReleaseAge: "3 days",
  },
};

const globalConfig = {
  platform: "gitlab",
  endpoint: "https://gitlab.example.com/api/v4/",
  globalExtends: ["github>test-org/global-preset"],
  rangeStrategy: "bump",
  labels: ["global-label"],
  onboarding: false,
  dryRun: "full",
};

const inheritedConfig = {
  extends: ["github>test-org/inherited-preset"],
  rangeStrategy: "pin",
  automerge: true,
  // globalOnly without inheritConfigSupport → stripped (with a warning)
  autodiscover: true,
  binarySource: "install",
  // globalOnly WITH inheritConfigSupport → kept through the strip, then
  // captured (and removed) by InheritConfig.set
  onboarding: false,
};

const repoConfig = JSON.stringify({
  extends: ["github>test-org/repo-preset"],
  rangeStrategy: "replace",
  dryRun: "full",
});

function runAll() {
  return runPipeline({
    fileName: "renovate.json",
    content: repoConfig,
    globalConfig,
    inheritedConfig,
    injectedPresets,
  });
}

describe("global + inherited config layers", () => {
  it("(a) merges with the real precedence: defaults < globalExtends < global < inherited < repo", async () => {
    const result = await runAll();
    expect(result.stageStatus.global).toBe("ok");
    expect(result.stageStatus.inherit).toBe("ok");
    expect(result.stageStatus.merge).toBe("ok");
    const final = result.finalConfig!;
    // set by every layer — the repo config wins
    expect(final.rangeStrategy).toBe("replace");
    // globalExtends-only key survives to the final config
    expect(final.prHourlyLimit).toBe(7);
    // global-only key survives
    expect(final.labels).toEqual(["global-label"]);
    // inherited-only key survives
    expect(final.automerge).toBe(true);
    // repo-preset key survives
    expect(final.minimumReleaseAge).toBe("3 days");
    // mergeable array concatenates across the layer stack in merge order
    expect(final.addLabels).toEqual(["from-global-extends", "from-inherited-preset"]);
    // the assembled global layer: globalExtends resolved UNDER the config,
    // GlobalConfig-captured options (platform/endpoint/onboarding/dryRun) gone
    const globalResolved = result.layerConfigs?.globalResolved;
    expect(globalResolved).toBeDefined();
    expect(globalResolved?.rangeStrategy).toBe("bump");
    expect(globalResolved).not.toHaveProperty("globalExtends");
    expect(globalResolved).not.toHaveProperty("platform");
    expect(globalResolved).not.toHaveProperty("endpoint");
    expect(globalResolved).not.toHaveProperty("onboarding");
    expect(globalResolved).not.toHaveProperty("dryRun");
    // captured global options never leak into the final config as layer values
    expect(final.onboarding).toBe(true); // still the untouched default
    expect(final.dryRun).toBe("full"); // repo tried to set it (warned, but merged as written)
  });

  it("(b) surfaces validateConfig warnings for globalOnly options in the repo config", async () => {
    const result = await runAll();
    const boundaryWarnings = result.warnings.filter((w) =>
      w.message.includes("reserved only for Renovate's global configuration"),
    );
    // repo `dryRun` + inherited `autodiscover`/`binarySource`
    expect(boundaryWarnings.length).toBeGreaterThanOrEqual(3);
    expect(boundaryWarnings.some((w) => w.message.includes(`"dryRun"`))).toBe(true);
    const events = result.events.filter(
      (e) =>
        e.stage === "validate" && e.kind === "validation-message" && e.title.includes(`"dryRun"`),
    );
    expect(events.length).toBe(1);
  });

  it("(c) resolves inherited-config presets and strips global options with keepInherited semantics", async () => {
    const result = await runAll();
    const inheritedResolved = result.layerConfigs?.inheritedResolved;
    expect(inheritedResolved).toBeDefined();
    // preset content resolved into the layer
    expect(inheritedResolved?.prConcurrentLimit).toBe(3);
    expect(result.finalConfig?.prConcurrentLimit).toBe(3);
    // globalOnly options stripped from the layer …
    expect(inheritedResolved).not.toHaveProperty("autodiscover");
    expect(inheritedResolved).not.toHaveProperty("binarySource");
    // … and inheritConfigSupport options captured by InheritConfig.set
    expect(inheritedResolved).not.toHaveProperty("onboarding");
    // the inherited `autodiscover: true` never reaches the final config —
    // only the untouched default (false) remains
    expect(result.finalConfig?.autodiscover).toBe(false);
    // the strip is warned about, not silent
    expect(result.warnings.some((w) => w.message.includes(`"autodiscover"`))).toBe(true);
  });

  it("(d) provenance chains contain global and inherited layer steps", async () => {
    const result = await runAll();
    const provenance = computeProvenance(result);
    expect(provenance).toBeDefined();
    const range = (provenance as Map<string, KeyProvenance>).get("rangeStrategy");
    expect(range?.finalValue).toBe("replace");
    const nonDefault = range!.chain.filter((s) => s.layer.kind !== "defaults");
    expect(nonDefault.map((s) => [s.layer.kind, s.action])).toEqual([
      ["global", "set"],
      ["inherited", "overwrite"],
      ["repo", "overwrite"],
    ]);
    expect(nonDefault[1]?.before).toBe("bump");
    expect(nonDefault[2]?.before).toBe("pin");
    // a key set only by the global layer is attributed to it and not default-only
    const labels = (provenance as Map<string, KeyProvenance>).get("labels");
    expect(labels?.isDefaultOnly).toBe(false);
    expect(labels?.chain.some((s) => s.layer.kind === "global")).toBe(true);
    // round-trip property still holds with the extra layers
    for (const [key, entry] of provenance as Map<string, KeyProvenance>) {
      expect(entry.chain.at(-1)?.after, `round-trip mismatch for ${key}`).toEqual(entry.finalValue);
    }
  });

  it("(e) absent layers report skipped stages and add nothing to the trace", async () => {
    const result = await runPipeline({
      fileName: "renovate.json",
      content: repoConfig,
      injectedPresets,
    });
    expect(result.stageStatus.global).toBe("skipped");
    expect(result.stageStatus.inherit).toBe("skipped");
    expect(result.layerConfigs).toBeUndefined();
    expect(result.events.some((e) => e.stage === "global" || e.stage === "inherit")).toBe(false);
    const provenance = computeProvenance(result);
    expect(provenance).toBeDefined();
    for (const entry of (provenance as Map<string, KeyProvenance>).values()) {
      expect(
        entry.chain.some((s) => s.layer.kind === "global" || s.layer.kind === "inherited"),
      ).toBe(false);
    }
    expect(result.finalConfig?.rangeStrategy).toBe("replace");
    expect(result.finalConfig?.labels).toEqual([]); // untouched default
  });

  it("records the platform context from the global config, and the explicit override", async () => {
    const reflected = await runAll();
    expect(reflected.platformContext).toEqual({
      platform: "gitlab",
      endpoint: "https://gitlab.example.com/api/v4/",
    });
    const overridden = await runPipeline({
      fileName: "renovate.json",
      content: repoConfig,
      globalConfig,
      inheritedConfig,
      injectedPresets,
      platform: "github",
      endpoint: "https://api.github.com/",
      platformOverride: true,
    });
    expect(overridden.platformContext).toEqual({
      platform: "github",
      endpoint: "https://api.github.com/",
      overridden: true,
    });
  });

  it("excludes an inherited layer that fails validation, surfacing the errors", async () => {
    const result = await runPipeline({
      fileName: "renovate.json",
      content: repoConfig,
      inheritedConfig: { enabledManagers: ["not-a-real-manager"] },
      injectedPresets,
    });
    expect(result.stageStatus.inherit).toBe("error");
    expect(result.layerConfigs?.inheritedResolved).toBeUndefined();
    expect(result.errors.length).toBeGreaterThan(0);
    // the run continues; the final config simply lacks the layer
    expect(result.finalConfig?.rangeStrategy).toBe("replace");
  });
});
