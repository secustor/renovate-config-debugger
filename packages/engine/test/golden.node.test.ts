/**
 * Golden project: runs with REAL renovate modules (no shims). Computes a
 * reference result straight from Renovate's own functions, asserts the engine
 * matches it, and writes the file snapshots the "shimmed" project must
 * reproduce byte-for-byte.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runPipeline } from "../src/index";
import {
  getDefaultConfig,
  GlobalConfig,
  massageConfig,
  memCache,
  mergeChildConfig,
  migrateConfig,
  parseFileConfig,
  resolveConfigPresets,
} from "../src/renovate-adapter";

function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
}

/** Renovate's own processing sequence, written independently of pipeline.ts. */
async function reference(fileName: string, content: string): Promise<Record<string, unknown>> {
  try {
    memCache.init();
    GlobalConfig.set({});
    const parsed = parseFileConfig(fileName, content);
    if (!parsed.success) {
      throw new Error(`fixture must parse: ${parsed.validationError}`);
    }
    const { migratedConfig } = migrateConfig(parsed.parsedContents as Record<string, unknown>);
    const massaged = massageConfig(migratedConfig);
    const { config } = await resolveConfigPresets(massaged);
    return mergeChildConfig(getDefaultConfig() as Record<string, unknown>, config);
  } finally {
    GlobalConfig.reset();
    memCache.reset();
  }
}

describe("golden reference", () => {
  for (const name of ["legacy-config.json", "internal-presets.json", "invalid.json"]) {
    it(`engine matches renovate's own output for ${name}`, async () => {
      const content = fixture(name);
      const expected = await reference(name, content);
      const result = await runPipeline({ fileName: name, content });
      expect(result.finalConfig).toEqual(expected);
      await expect(JSON.stringify(result.finalConfig, null, 2)).toMatchFileSnapshot(
        `__snapshots__/${name}.final.json`,
      );
    });
  }

  it("reports validation messages for invalid.json", async () => {
    const result = await runPipeline({
      fileName: "invalid.json",
      content: fixture("invalid.json"),
    });
    expect(result.errors.length + result.warnings.length).toBeGreaterThan(0);
    expect(result.stageStatus.validate).toBe("error");
  });

  it("handles parse errors without throwing", async () => {
    const result = await runPipeline({
      fileName: "parse-error.json5",
      content: fixture("parse-error.json5"),
    });
    expect(result.stageStatus.parse).toBe("error");
    expect(result.finalConfig).toBeUndefined();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.stageStatus.merge).toBe("skipped");
  });
});
