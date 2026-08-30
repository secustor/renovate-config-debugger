/**
 * Golden twin of extract.shimmed.test.ts: runs `extractDeps` with REAL
 * renovate modules — the managers read files through the real fs under a
 * temporary `GlobalConfig.localDir` — and writes the file snapshots the
 * shimmed project must reproduce byte-for-byte. The engine's own seeding path
 * (upstream's `writeLocalFile`) materializes each fixture on disk here, the
 * same call that fills the in-memory store in the browser graph.
 */
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  EXTRACTABLE_MANAGERS,
  extractDeps,
  matchExtractableManagers,
  matchManagersForFile,
} from "../src/index";
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
      // The manager is explicit: several managers can claim one filename
      // (pyproject.toml is pep621's, pixi's and poetry's), and a CASE names
      // which parser it is exercising — filename matching has its own tests.
      const outcome = await extractDeps({
        fileName: c.fileName,
        content: extractFixture(c.fixture),
        manager: c.manager,
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
      // every dep is nameable — massageDepNames ran. Filtered rather than
      // guarded so the assertion runs unconditionally: an `expect` inside an
      // `if` silently does nothing when no row reaches it, which for a
      // whole-collection claim is indistinguishable from passing.
      const named = outcome.file.deps.filter((dep) => dep.packageName !== undefined);
      expect(named.map((dep) => dep.depName)).not.toContain(undefined);
      await expect(JSON.stringify(outcome.file, null, 2)).toMatchFileSnapshot(
        extractSnapshotPath(c.manager),
      );
    });
  }

  it("stores every fixture under a name no dependency scanner reads", async () => {
    // A fixture named `go.mod` / `pom.xml` / `Cargo.lock` is indistinguishable
    // from one of THIS repo's own manifests to a scanner walking the tree —
    // osv-scanner reported CVEs against the pinned versions in them. The bytes
    // stay real, the on-disk name carries `.fixture`; extractFixture appends it.
    const root = join(import.meta.dirname, "fixtures", "extract");
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    const offenders = entries
      .filter((entry) => entry.isFile() && !entry.name.endsWith(".fixture"))
      .map((entry) => relative(root, join(entry.parentPath, entry.name)));
    expect(offenders).toEqual([]);
    // A suffix only helps a scanner that reads the file. Container scanners
    // glob the NAME, so `Dockerfile.fixture` still warned that its image is
    // unpinned — that one is stored as `container.fixture`, and neither
    // spelling of the name may come back.
    const globbed = entries
      .map((entry) => relative(root, join(entry.parentPath, entry.name)))
      .filter((path) => /(docker|container)file/i.test(path));
    expect(globbed).toEqual([]);
  });

  it("matches managers by file pattern, in upstream's order", () => {
    expect(matchManagersForFile("Dockerfile")).toContain("dockerfile");
    expect(matchManagersForFile(".github/workflows/ci.yml")).toContain("github-actions");
    expect(matchManagersForFile("renovate.json")).not.toContain("npm");
  });

  it("attributes a repo walk's paths to the managers that claim them", () => {
    const walk = matchExtractableManagers([
      "README.md",
      "package.json",
      "node_modules/left-pad/package.json",
      ".github/workflows/ci.yml",
      "build.gradle",
    ]);
    // Input order, and only the paths an EXTRACTABLE manager claims — gradle
    // matches but is not in the ledger, so `build.gradle` is not walked. The
    // ignorePaths filter is the caller's, so a vendored manifest still matches.
    expect(walk.files.map((file) => file.path)).toEqual([
      "package.json",
      "node_modules/left-pad/package.json",
      ".github/workflows/ci.yml",
    ]);
    expect(walk.files[0]?.managers).toContain("npm");
    expect(walk.files[2]?.managers).toContain("github-actions");
    // The denominator the Extract phase's "K of N managers" quotes: every
    // manager the walk actually asked, which is more than one and no more
    // than the ledger.
    expect(walk.managersConsidered).toBeGreaterThan(1);
    expect(walk.managersConsidered).toBeLessThanOrEqual(EXTRACTABLE_MANAGERS.length);
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
