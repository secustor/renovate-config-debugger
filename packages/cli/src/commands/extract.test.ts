import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { fixture, runCli, runJson } from "../test-harness";

/**
 * Roadmap 078's CLI half. Fixtures are stored under a name no dependency
 * scanner reads (`*.fixture`, the engine's own extraction suite convention)
 * and materialized here under the REAL filename `extract` matches on — a
 * `package.json` or `build.gradle` living in this repo's own tree would be
 * indistinguishable from one of its manifests to a scanner walking it.
 */

let dir: string | null = null;

afterEach(async () => {
  if (dir !== null) {
    await rm(dir, { recursive: true, force: true });
    dir = null;
  }
});

async function materialize(fixtureName: string, realName: string): Promise<string> {
  const content = await readFile(fixture(`extract/${fixtureName}.fixture`), "utf8");
  dir = await mkdtemp(join(tmpdir(), "rcd-extract-"));
  const path = join(dir, realName);
  await writeFile(path, content, "utf8");
  return path;
}

describe("extract", () => {
  test("auto-matches the manager by filename and reports its deps", async () => {
    const path = await materialize("package.json", "package.json");
    const run = await runJson<{
      fileName: string;
      matchedManagers: string[];
      results: { ok: boolean; file?: { manager: string; deps: { depName: string }[] } }[];
    }>(["extract", path, "--format", "json"]);
    expect(run.code).toBe(0);
    expect(run.payload.matchedManagers).toContain("npm");
    expect(run.payload.results).toHaveLength(1);
    const [result] = run.payload.results;
    expect(result?.ok).toBe(true);
    expect(result?.file?.manager).toBe("npm");
    expect(result?.file?.deps.map((dep) => dep.depName)).toContain("react");
  });

  test("pretty output lists depName, currentValue, datasource and depType", async () => {
    const path = await materialize("package.json", "package.json");
    const run = await runCli(["extract", path]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("npm —");
    expect(run.stdout).toContain("react");
    expect(run.stdout).toContain("17.0.0");
    expect(run.stdout).toContain("npm");
    expect(run.stdout).toContain("dependencies");
  });

  test("several managers claiming one filename all run and are all reported", async () => {
    const path = await materialize("pyproject.toml", "pyproject.toml");
    const run = await runJson<{
      matchedManagers: string[];
      results: { ok: boolean; file?: { manager: string } }[];
    }>(["extract", path, "--format", "json"]);
    // pyproject.toml is pep621's, pixi's and poetry's.
    expect(run.payload.matchedManagers).toEqual(
      expect.arrayContaining(["pep621", "pixi", "poetry"]),
    );
    expect(run.payload.results.length).toBeGreaterThanOrEqual(3);
    const pep621 = run.payload.results.find((r) => r.ok && r.file?.manager === "pep621");
    expect(pep621?.ok).toBe(true);
  });

  test("--manager forces one, the only door for a pattern-less manager", async () => {
    const path = await materialize("deployment.yaml", "k8s-deployment.yaml");
    const run = await runJson<{
      matchedManagers: string[];
      requestedManager: string;
      results: { ok: boolean; file?: { manager: string; deps: { depName: string }[] } }[];
    }>(["extract", path, "--manager", "kubernetes", "--format", "json"]);
    expect(run.code).toBe(0);
    // kubernetes ships empty managerFilePatterns — never matched by filename.
    expect(run.payload.matchedManagers).not.toContain("kubernetes");
    expect(run.payload.requestedManager).toBe("kubernetes");
    const [result] = run.payload.results;
    expect(result?.ok).toBe(true);
    expect(result?.file?.manager).toBe("kubernetes");
    expect(result?.file?.deps.map((dep) => dep.depName)).toContain("nginx");
  });

  test("no manager matches the filename and none was forced", async () => {
    const path = await materialize("notes.md", "notes.md");
    const run = await runCli(["extract", path]);
    expect(run.code).toBe(1);
    expect(run.stdout).toContain("no manager");
    expect(run.stdout).toContain("notes.md");
  });

  test("a matched-but-unmapped manager reports the engine's own gap, not a guess", async () => {
    const path = await materialize("build.gradle", "build.gradle");
    const run = await runJson<{
      matchedManagers: string[];
      results: { ok: boolean; message?: string }[];
    }>(["extract", path, "--format", "json"]);
    expect(run.code).toBe(1);
    expect(run.payload.matchedManagers).toContain("gradle");
    expect(run.payload.results[0]?.ok).toBe(false);
    expect(run.payload.results[0]?.message).toContain("not supported in the browser engine");
  });

  test("an unreadable file is a clear IO error", async () => {
    const run = await runCli(["extract", "/no/such/file/package.json"]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("cannot read file");
  });

  test("no file named is an error", async () => {
    const run = await runCli(["extract"]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("name a file");
  });

  test("--help documents the pattern-less-manager door", async () => {
    const run = await runCli(["extract", "--help"]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("--manager");
    expect(run.stdout).toContain("pattern-less manager");
  });
});
