/**
 * Shimmed twin of extract-custom.node.test.ts: the browser module graph runs
 * the same `customManagers` blocks — the extraction path is the one the
 * feasibility spike proved needs no new shims — and must reproduce the golden
 * project's file snapshots byte-for-byte.
 */
import { describe, expect, it } from "vitest";
import { extractCustomDeps, matchExtractableManagers } from "../src/index";
import {
  BROKEN_REGEX_BLOCK,
  CUSTOM_EXTRACT_CASES,
  customExtractSnapshotPath,
  JSONATA_BLOCK,
  REGEX_BLOCK,
} from "./extract-custom-cases";
import { mustExtract } from "./helpers";

describe("extractCustomDeps (shimmed)", () => {
  for (const c of CUSTOM_EXTRACT_CASES) {
    it(`extracts ${c.name}, byte-identical to golden`, async () => {
      const outcome = mustExtract(
        await extractCustomDeps({ fileName: c.fileName, content: c.content, block: c.block }),
      );
      expect(
        outcome.file.deps.map((dep) => ({
          depName: dep.depName,
          currentValue: dep.currentValue,
        })),
      ).toEqual(c.expectDeps);
      await expect(JSON.stringify(outcome.file, null, 2)).toMatchFileSnapshot(
        customExtractSnapshotPath(c.name),
      );
    });
  }

  it("reports extract-error for a matchStrings pattern that will not compile", async () => {
    // The browser falls back to native RegExp (spike §3): an uncompilable
    // pattern still has to come back as an outcome, never as a throw.
    const outcome = await extractCustomDeps({
      fileName: "Dockerfile",
      content: "FROM alpine:3.20\n",
      block: BROKEN_REGEX_BLOCK,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.reason).toBe("extract-error");
  });

  it("reports unsupported-manager for a customType the engine cannot run", async () => {
    const outcome = await extractCustomDeps({
      fileName: "Dockerfile",
      content: "FROM alpine:3.20\n",
      block: { customType: "yamlpath", managerFilePatterns: ["**/Dockerfile"] },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.reason).toBe("unsupported-manager");
  });

  it("walks custom blocks through the shimmed getMatchingFiles", () => {
    const paths = ["package.json", "build/versions.txt", "config/deps.yaml"];
    const walk = matchExtractableManagers(paths, {
      customManagers: [
        { ...REGEX_BLOCK, managerFilePatterns: ["**/versions.txt"] },
        { ...JSONATA_BLOCK, managerFilePatterns: ["**/deps.yaml"] },
        { ...REGEX_BLOCK, managerFilePatterns: ["**/versions.txt"], enabled: false },
      ],
    });
    expect(walk.customManagersConsidered).toBe(2);
    expect(walk.files.map((file) => file.path)).toEqual(paths);
    expect(walk.files[1]?.managers).toEqual(["custom.regex"]);
    expect(walk.files[1]?.customBlocks).toEqual([0]);
    expect(walk.files[2]?.managers).toEqual(["custom.jsonata"]);
    expect(walk.files[2]?.customBlocks).toEqual([1]);
  });
});
