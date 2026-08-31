/**
 * Golden twin of extract-custom.shimmed.test.ts (roadmap 063): the user's own
 * `customManagers` blocks run through REAL renovate modules, writing the file
 * snapshots the browser module graph must reproduce byte-for-byte.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractCustomDeps, matchExtractableManagers } from "../src/index";
import { GlobalConfig } from "../src/renovate-adapter";
import {
  BROKEN_REGEX_BLOCK,
  CUSTOM_EXTRACT_CASES,
  customExtractSnapshotPath,
  JSONATA_BLOCK,
  REGEX_BLOCK,
} from "./extract-custom-cases";
import { mustExtract } from "./helpers";

describe("extractCustomDeps (golden)", () => {
  let dir: string | null = null;

  afterEach(async () => {
    GlobalConfig.reset();
    if (dir !== null) {
      await rm(dir, { recursive: true, force: true });
      dir = null;
    }
  });

  async function withLocalDir(): Promise<void> {
    dir = await mkdtemp(join(tmpdir(), "rcd-extract-custom-"));
    GlobalConfig.set({ localDir: dir });
  }

  for (const c of CUSTOM_EXTRACT_CASES) {
    it(`extracts ${c.name} from the block's own config`, async () => {
      await withLocalDir();
      const outcome = mustExtract(
        await extractCustomDeps({ fileName: c.fileName, content: c.content, block: c.block }),
      );
      expect(outcome.file.manager).toBe(`custom.${String(c.block.customType)}`);
      expect(outcome.file.fileName).toBe(c.fileName);
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

  it("reports no-deps when the file holds no matching span", async () => {
    await withLocalDir();
    // The `datasoure=` typo case, on its own: the comment is there, the
    // manager is right, and the answer is honestly nothing.
    const outcome = await extractCustomDeps({
      fileName: "Dockerfile",
      content:
        "FROM alpine:3.20\n# renovate: datasoure=github-releases depName=typo/typo\nARG X_VERSION=1.0.0\n",
      block: REGEX_BLOCK,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.reason).toBe("no-deps");
    expect(outcome.matchedManagers).toEqual(["custom.regex"]);
  });

  it("reports extract-error for a matchStrings pattern that will not compile", async () => {
    await withLocalDir();
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
    expect(outcome.message).not.toBe("");
  });

  it("reports unsupported-manager for a customType the engine cannot run", async () => {
    const unknown = await extractCustomDeps({
      fileName: "Dockerfile",
      content: "FROM alpine:3.20\n",
      block: { customType: "yamlpath", managerFilePatterns: ["**/Dockerfile"] },
    });
    expect(unknown.ok).toBe(false);
    if (unknown.ok) {
      return;
    }
    expect(unknown.reason).toBe("unsupported-manager");
    expect(unknown.message).toContain("yamlpath");

    const missing = await extractCustomDeps({
      fileName: "Dockerfile",
      content: "FROM alpine:3.20\n",
      block: { managerFilePatterns: ["**/Dockerfile"] },
    });
    expect(missing.ok).toBe(false);
    if (missing.ok) {
      return;
    }
    expect(missing.reason).toBe("unsupported-manager");
  });
});

describe("matchExtractableManagers with customManagers (golden)", () => {
  const paths = ["package.json", "build/versions.txt", "config/deps.yaml"];
  const regexBlock = { ...REGEX_BLOCK, managerFilePatterns: ["**/versions.txt"] };
  const jsonataBlock = { ...JSONATA_BLOCK, managerFilePatterns: ["**/deps.yaml"] };

  it("claims paths no built-in manager does, labelled and indexed", () => {
    // The baseline first: without the blocks these two paths are not walked at
    // all, which is what makes the claim below attributable to them.
    expect(matchExtractableManagers(paths).files.map((file) => file.path)).toEqual([
      "package.json",
    ]);

    const walk = matchExtractableManagers(paths, { customManagers: [regexBlock, jsonataBlock] });
    expect(walk.files.map((file) => file.path)).toEqual(paths);
    expect(walk.files[0]?.managers).toContain("npm");
    expect(walk.files[0]?.customBlocks).toBeUndefined();
    expect(walk.files[1]).toEqual({
      path: "build/versions.txt",
      managers: ["custom.regex"],
      customBlocks: [0],
    });
    expect(walk.files[2]).toEqual({
      path: "config/deps.yaml",
      managers: ["custom.jsonata"],
      customBlocks: [1],
    });
    expect(walk.customManagersConsidered).toBe(2);
  });

  it("keeps built-in claims first when a block claims the same path", () => {
    const walk = matchExtractableManagers(["package.json"], {
      customManagers: [{ ...REGEX_BLOCK, managerFilePatterns: ["**/package.json"] }],
    });
    const managers = walk.files[0]?.managers ?? [];
    expect(managers[0]).toBe("npm");
    expect(managers.at(-1)).toBe("custom.regex");
    expect(walk.files[0]?.customBlocks).toEqual([0]);
  });

  it("labels one path once per custom type but records every claiming block", () => {
    const walk = matchExtractableManagers(["build/versions.txt"], {
      customManagers: [regexBlock, { ...regexBlock, matchStrings: ["other=(?<depName>.+)"] }],
    });
    expect(walk.files[0]?.managers).toEqual(["custom.regex"]);
    expect(walk.files[0]?.customBlocks).toEqual([0, 1]);
    expect(walk.customManagersConsidered).toBe(2);
  });

  it("does not consider a disabled, a pattern-less or an unsupported block", () => {
    const walk = matchExtractableManagers(paths, {
      customManagers: [
        { ...regexBlock, enabled: false },
        { ...JSONATA_BLOCK, managerFilePatterns: [] },
        { customType: "yamlpath", managerFilePatterns: ["**/deps.yaml"] },
      ],
    });
    expect(walk.customManagersConsidered).toBe(0);
    expect(walk.files.map((file) => file.path)).toEqual(["package.json"]);
  });

  it("considers no custom managers when none are passed", () => {
    expect(matchExtractableManagers(paths).customManagersConsidered).toBe(0);
    expect(matchExtractableManagers(paths, {}).customManagersConsidered).toBe(0);
  });
});
