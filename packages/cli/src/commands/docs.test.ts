import { describe, expect, test } from "vitest";
import { runCli, runJson } from "../test-harness";

describe("docs", () => {
  test("an option's metadata for the pinned Renovate", async () => {
    const run = await runJson<{
      name: string;
      url: string;
      renovateVersion: string;
      optionsSourceUrl: string;
      isContainer: boolean;
      childOptions: string[];
      placement: { kind: string };
    }>(["docs", "packageRules", "--format", "json"]);
    expect(run.code).toBe(0);
    const doc = run.payload;
    expect(doc.name).toBe("packageRules");
    expect(doc.url).toContain("docs.renovatebot.com");
    expect(doc.renovateVersion).toMatch(/^\d+\./);
    // Version-pinned, unlike `url` — docs.renovatebot.com serves latest.
    expect(doc.optionsSourceUrl).toContain(`renovate/v/${doc.renovateVersion}`);
    expect(doc.isContainer).toBe(true);
    expect(doc.childOptions).toContain("matchPackageNames");
    expect(doc.placement.kind).toBe("unrestricted");
  });

  test("pretty output names the version and says where the option may go", async () => {
    const run = await runCli(["docs", "minimumReleaseAge"]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("— Renovate ");
    expect(run.stdout).toContain("placement: no restriction");
  });

  test("--search lists candidates", async () => {
    const run = await runJson<{ matches: { name: string }[]; optionsSourceUrl: string }>([
      "docs",
      "matchPackage",
      "--search",
      "--format",
      "json",
    ]);
    expect(run.code).toBe(0);
    const found = run.payload;
    expect(found.matches.map((m) => m.name)).toContain("matchPackageNames");
    expect(found.optionsSourceUrl).toContain("renovate/v/");
  });

  test("--search counts against the pinned version's option table", async () => {
    const run = await runCli(["docs", "matchPackage", "--search"]);
    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(
      /^\d+ of \d+ options in Renovate \d+\.\d+\.\d+ match "matchPackage"/,
    );
  });

  test("--help states the version-history ceiling rather than leaving a gap", async () => {
    const run = await runCli(["docs", "--help"]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("no per-option version history");
  });

  test("an option that does not exist points at --search", async () => {
    const run = await runCli(["docs", "nopeNotAnOption"]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("--search");
  });
});
