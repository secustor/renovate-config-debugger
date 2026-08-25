/**
 * Golden twin of extract.shimmed.test.ts: runs `extractDeps` with REAL
 * renovate modules — the managers read files through the real fs under a
 * temporary `GlobalConfig.localDir` — and writes the file snapshots the
 * shimmed project must reproduce byte-for-byte. The engine's own seeding path
 * (upstream's `writeLocalFile`) materializes each fixture on disk here, the
 * same call that fills the in-memory store in the browser graph.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractDeps, matchManagersForFile } from "../src/index";
import { GlobalConfig } from "../src/renovate-adapter";
import { EXTRACT_CASES, extractFixture, extractSnapshotPath } from "./extract-cases";
import { must } from "./helpers";

describe("extractDeps (golden)", () => {
  let dir: string | null = null;

  afterEach(async () => {
    GlobalConfig.reset();
    if (dir !== null) {
      await rm(dir, { recursive: true, force: true });
      dir = null;
    }
  });

  for (const c of EXTRACT_CASES) {
    it(`extracts ${c.fixture} with ${c.manager}`, async () => {
      dir = await mkdtemp(join(tmpdir(), "rcd-extract-"));
      GlobalConfig.set({ localDir: dir });
      const outcome = await extractDeps({
        fileName: c.fileName,
        content: extractFixture(c.fixture),
      });
      if (!outcome.ok) {
        throw new Error(`expected extraction to succeed: ${outcome.message}`);
      }
      expect(outcome.file.manager).toBe(c.manager);
      expect(outcome.file.fileName).toBe(c.fileName);
      const depNames = outcome.file.deps.map((dep) => dep.depName);
      for (const name of c.expectDeps) {
        expect(depNames).toContain(name);
      }
      // every dep is nameable — massageDepNames ran
      for (const dep of outcome.file.deps) {
        if (dep.packageName !== undefined) {
          expect(dep.depName).toBeDefined();
        }
      }
      await expect(JSON.stringify(outcome.file, null, 2)).toMatchFileSnapshot(
        extractSnapshotPath(c.manager),
      );
    });
  }

  it("matches managers by file pattern, in upstream's order", () => {
    expect(matchManagersForFile("Dockerfile")).toContain("dockerfile");
    expect(matchManagersForFile(".github/workflows/ci.yml")).toContain("github-actions");
    expect(matchManagersForFile("renovate.json")).not.toContain("npm");
  });

  it("reports an honest gap for a matched-but-unmapped manager", async () => {
    dir = await mkdtemp(join(tmpdir(), "rcd-extract-"));
    GlobalConfig.set({ localDir: dir });
    // gradle is extractAllPackageFiles-only upstream: matched, not extractable
    const outcome = await extractDeps({
      fileName: "build.gradle",
      content: "dependencies { implementation 'org.slf4j:slf4j-api:2.0.13' }\n",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.reason).toBe("unsupported-manager");
    expect(outcome.matchedManagers).toContain("gradle");
    expect(outcome.message).toContain("not supported in the browser engine");
  });

  it("reports no-manager for a file nothing claims", async () => {
    const outcome = await extractDeps({ fileName: "notes.md", content: "# notes\n" });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.reason).toBe("no-manager");
  });

  it("resolves support files through the same fs the manager reads", async () => {
    dir = await mkdtemp(join(tmpdir(), "rcd-extract-"));
    GlobalConfig.set({ localDir: dir });
    const outcome = await extractDeps({
      fileName: "Cargo.toml",
      content: extractFixture("Cargo.toml"),
      supportFiles: [{ fileName: "Cargo.lock", content: extractFixture("Cargo.lock") }],
    });
    if (!outcome.ok) {
      throw new Error(`expected extraction to succeed: ${outcome.message}`);
    }
    const serde = must(
      outcome.file.deps.find((dep) => dep.depName === "serde"),
      "a serde dep",
    );
    expect(serde.lockedVersion).toBe("1.0.203");
  });
});
