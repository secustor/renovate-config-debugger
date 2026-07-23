/**
 * Shimmed project: the same module graph the browser bundle uses. Asserts the
 * engine reproduces the golden snapshots (shims must not alter behavior) and
 * checks the trace shape the UI depends on.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runPipeline } from "../src/index";

function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
}

describe("shimmed pipeline matches golden snapshots", () => {
  for (const name of ["legacy-config.json", "internal-presets.json", "invalid.json"]) {
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
      parse: "ok",
      migrate: "ok",
      massage: "ok",
      validate: "ok",
      preset: "ok",
      merge: "ok",
    });
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
