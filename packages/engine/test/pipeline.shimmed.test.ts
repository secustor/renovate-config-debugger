/**
 * Shimmed project: the same module graph the browser bundle uses. Asserts the
 * engine reproduces the golden snapshots (shims must not alter behavior) and
 * checks the trace shape the UI depends on.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getOptionIndex, runPipeline } from "../src/index";

function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
}

describe("shimmed pipeline matches golden snapshots", () => {
  for (const name of [
    "legacy-config.json",
    "migration-steps.json",
    "internal-presets.json",
    "preset-package-rules.json",
    "invalid.json",
  ]) {
    it(`produces the golden final config for ${name}`, async () => {
      const result = await runPipeline({ fileName: name, content: fixture(name) });
      await expect(JSON.stringify(result.finalConfig, null, 2)).toMatchFileSnapshot(
        `__snapshots__/${name}.final.json`,
      );
    });
  }
});

describe("trace shape", () => {
  it("emits migration events for legacy configs", async () => {
    const result = await runPipeline({
      fileName: "legacy-config.json",
      content: fixture("legacy-config.json"),
    });
    const migration = result.events.find((e) => e.kind === "migration-applied");
    expect(migration).toBeDefined();
    expect(migration?.delta?.length).toBeGreaterThan(0);
    expect(result.stageStatus).toEqual({
      global: "skipped",
      inherit: "skipped",
      parse: "ok",
      migrate: "ok",
      massage: "ok",
      validate: "ok",
      preset: "ok",
      merge: "ok",
    });
  });

  it("emits discrete, named migration steps for a legacy config", async () => {
    const result = await runPipeline({
      fileName: "migration-steps.json",
      content: fixture("migration-steps.json"),
    });
    const steps = result.events.filter(
      (e) => e.kind === "migration-applied" && e.stage === "migrate",
    );
    // several distinct migrations, each with a non-empty diff and a name
    expect(steps.length).toBeGreaterThan(3);
    for (const step of steps) {
      expect(step.delta?.length).toBeGreaterThan(0);
      expect(step.migration?.name).toBeTruthy();
      expect(step.migration?.className).toBeTruthy();
      expect(step.before).toBeDefined();
      expect(step.after).toBeDefined();
    }
    // a top-level rename surfaces with its old → new name + the target key
    const rename = steps.find((s) => s.migration?.key === "versionScheme");
    expect(rename?.migration?.className).toBe("RenamePropertyMigration");
    expect(rename?.migration?.newKey).toBe("versioning");
    expect(rename?.migration?.name).toBe("versionScheme → versioning");
    expect(rename?.migration?.explanation).toBeTruthy();
    // the packageRules matcher rename (packageNames → matchPackageNames) fires
    expect(steps.some((s) => s.migration?.className === "PackageRulesMigration")).toBe(true);
    // the last migrate-stage step's `after` equals the real migrated config,
    // which is also what stage-complete carries
    const stageComplete = result.events.findLast(
      (e) => e.stage === "migrate" && e.kind === "stage-complete",
    );
    const lastStep = steps.at(-1);
    expect(lastStep?.after).toEqual(stageComplete?.after);
  });

  it("re-migrates the resolved config like upstream mergeRenovateConfig", async () => {
    // `extends: ["group:nodeJs"]` INSIDE a packageRule: resolution merges the
    // preset into the rule, leaving its rules nested under `packageRules` —
    // only the post-resolution migration flattens them into one combined rule
    // (parent matchers AND preset matchers). Without it the rule would match
    // on `matchUpdateTypes` alone, i.e. every patch/minor update.
    const result = await runPipeline({
      fileName: "preset-package-rules.json",
      content: fixture("preset-package-rules.json"),
    });
    const rules = (result.finalConfig?.packageRules ?? []) as Record<string, unknown>[];
    const rule = rules.find((r) => r.groupName === "NodeJS");
    expect(rule).toBeDefined();
    expect(rule?.matchUpdateTypes).toEqual(["patch", "minor"]);
    expect(rule?.matchDatasources).toEqual(["docker", "node-version"]);
    expect(rule?.automerge).toBe(true);
    expect(rule).not.toHaveProperty("extends");
    expect(rule).not.toHaveProperty("packageRules");
    // the flattening surfaces as a granular preset-stage step, not tied to any
    // preset fetch (no presetName), and the stage title reports it
    const flatten = result.events.find(
      (e) =>
        e.kind === "migration-applied" &&
        e.stage === "preset" &&
        e.migration?.className === "FlattenNestedPackageRules",
    );
    expect(flatten).toBeDefined();
    expect(flatten?.migration?.presetName).toBeUndefined();
    expect(flatten?.delta?.length).toBeGreaterThan(0);
    const stageComplete = result.events.findLast(
      (e) => e.stage === "preset" && e.kind === "stage-complete",
    );
    expect(stageComplete?.title).toContain("re-migrated the resolved config");
    // the stage hands the re-migrated config onward: its `after` already shows
    // the flattened rule, so the stage diff explains where the rule came from
    const after = (stageComplete?.after ?? {}) as Record<string, unknown>;
    const afterRules = after.packageRules as Record<string, unknown>[];
    expect(afterRules.some((r) => Array.isArray(r.packageRules))).toBe(false);
  });

  it("re-migration stays silent for configs that don't need it", async () => {
    // The post-resolution migration pass must not add noise for ordinary
    // configs: no orphan (presetName-less) migration events in the preset
    // stage, and no title suffix — the Migrate chip/stepper and the preset
    // tree read exactly the streams asserted here.
    for (const name of ["legacy-config.json", "migration-steps.json", "internal-presets.json"]) {
      const result = await runPipeline({ fileName: name, content: fixture(name) });
      const orphanSteps = result.events.filter(
        (e) => e.kind === "migration-applied" && e.stage === "preset" && !e.migration?.presetName,
      );
      expect(orphanSteps, name).toEqual([]);
      const title = result.events.findLast(
        (e) => e.stage === "preset" && e.kind === "stage-complete",
      )?.title;
      expect(title, name).not.toContain("re-migrated");
    }
  });

  it("tracks visited presets and preset-fetch events", async () => {
    const result = await runPipeline({
      fileName: "internal-presets.json",
      content: fixture("internal-presets.json"),
    });
    expect(result.visitedPresets.merged).toContain("config:recommended");
    expect(result.events.some((e) => e.kind === "preset-fetch")).toBe(true);
  });

  it("builds the preset resolution tree", async () => {
    const result = await runPipeline({
      fileName: "internal-presets.json",
      content: fixture("internal-presets.json"),
    });
    const root = result.presetTree;
    expect(root).toBeDefined();
    expect(root?.state).toBe("resolved");
    // direct children preserve the extends order of the input config
    expect(root?.children.map((c) => c.name)).toEqual([
      "config:recommended",
      ":disableDependencyDashboard",
    ]);
    const recommended = root?.children[0];
    expect(recommended?.state).toBe("resolved");
    expect(recommended?.source?.presetSource).toBe("internal");
    expect(recommended?.source?.repo).toBe("config");
    expect(recommended?.source?.presetName).toBe("recommended");
    // config:recommended transitively extends further presets
    expect(recommended?.children.length).toBeGreaterThan(0);
    expect(recommended?.fetched).toBeDefined();
    expect(recommended?.input).toBeDefined();
    expect(recommended?.resolved).toBeDefined();
    // nesting is mirrored into preset-resolved events with parentId links
    const resolvedEvents = result.events.filter((e) => e.kind === "preset-resolved");
    expect(resolvedEvents.length).toBeGreaterThan(1);
    expect(resolvedEvents.some((e) => e.parentId)).toBe(true);
  });

  it("never flags $schema in validation output (roadmap 026)", async () => {
    // internal-presets.json ships $schema at the top, same as the app's
    // default/example configs.
    const result = await runPipeline({
      fileName: "internal-presets.json",
      content: fixture("internal-presets.json"),
    });
    expect(result.stageStatus.validate).toBe("ok");
    const mentions = [...result.errors, ...result.warnings].filter(
      (m) => m.topic.includes("$schema") || m.message.includes("$schema"),
    );
    // Guards against a future renovate bump silently starting to flag it —
    // it's currently ignored via `ignoredNodes` in renovate's own validator.
    expect(mentions).toEqual([]);
  });

  it("emits validation-message events", async () => {
    const result = await runPipeline({
      fileName: "invalid.json",
      content: fixture("invalid.json"),
    });
    expect(result.events.some((e) => e.kind === "validation-message")).toBe(true);
  });

  it("contains preset resolution failures as stage errors, run survives", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new TypeError("simulated network failure"));
    try {
      const result = await runPipeline({
        fileName: "github-preset.json",
        content: fixture("github-preset.json"),
      });
      expect(result.stageStatus.preset).toBe("error");
      expect(result.stageStatus.merge).toBe("ok");
      expect(result.finalConfig).toBeDefined();
      expect(result.events.some((e) => e.kind === "preset-error")).toBe(true);
      // the failing node is marked inline; the aborted root stays labelled
      const failing = result.presetTree?.children[0];
      expect(failing?.name).toBe("github>example-org/renovate-config");
      expect(failing?.state).toBe("error");
      expect(failing?.error?.message).toBeTruthy();
      expect(result.presetTree?.state).toBe("aborted");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("option index (roadmap 026)", () => {
  it("models $schema as a known option, not renovate's own metadata", () => {
    const doc = getOptionIndex().options.get("$schema");
    expect(doc).toBeDefined();
    expect(doc?.description).toContain("ignored by Renovate itself");
    expect(doc?.url).toBeTruthy();
  });
});
