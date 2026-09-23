import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRenovateLog, type RenovateLog } from "./renovate-log";

// Trimmed from a real `renovate --platform=local` run (44.97.5), LOG_LEVEL=debug LOG_FORMAT=json.
const FIXTURE = readFileSync(new URL("renovate-log.fixture.ndjson", import.meta.url), "utf8");

function parsed(text: string): RenovateLog {
  const result = parseRenovateLog(text);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.log;
}

function line(record: Record<string, unknown>): string {
  return JSON.stringify(record);
}

function packageFilesLine(repository: string, baseBranch: string, depName: string): string {
  return line({
    msg: "packageFiles with updates",
    repository,
    baseBranch,
    config: { npm: [{ packageFile: "package.json", deps: [{ depName, currentValue: "1.0.0" }] }] },
  });
}

describe("parseRenovateLog", () => {
  it("reads the real NDJSON fixture, skipping its non-JSON line", () => {
    const log = parsed(FIXTURE);
    expect(log.renovateVersion).toBe("44.97.5");
    expect(log.baseBranch).toBeNull();
    expect(log.managers).toEqual(["dockerfile", "github-actions", "npm", "regex"]);
    expect(log.packageFiles.map((file) => [file.manager, file.fileName])).toEqual([
      ["dockerfile", "Dockerfile"],
      ["github-actions", ".github/workflows/ci.yml"],
      ["npm", "package.json"],
      ["regex", "versions.env"],
    ]);
    const npm = log.packageFiles.find((file) => file.manager === "npm");
    expect(npm?.packageFileVersion).toBe("1.0.0");
    expect(npm?.deps[0]).toEqual({
      depName: "lodash",
      packageName: "lodash",
      currentValue: "4.17.15",
      currentVersion: "4.17.15",
      datasource: "npm",
      depType: "dependencies",
      versioning: "npm",
    });
  });

  it("treats platform=local's literal repository as no slug", () => {
    expect(parsed(FIXTURE).slug).toBeNull();
  });

  it("keeps a real slug", () => {
    expect(parsed(packageFilesLine("acme/webapp", "", "a")).slug).toBe("acme/webapp");
  });

  it("accepts a JSON array of log objects", () => {
    const records = FIXTURE.split("\n").flatMap((text) => {
      try {
        return [JSON.parse(text) as unknown];
      } catch {
        return [];
      }
    });
    expect(parsed(JSON.stringify(records))).toEqual(parsed(FIXTURE));
  });

  it("reads lines behind a prefix, like CI timestamps", () => {
    const log = parsed(`2026-09-23T11:26:40Z ${packageFilesLine("acme/webapp", "", "a")}`);
    expect(log.packageFiles).toHaveLength(1);
  });

  it("keeps skipped deps with their reason — the view decides what is pinnable", () => {
    const docker = parsed(FIXTURE).packageFiles.find((file) => file.manager === "dockerfile");
    expect(docker?.deps[0]?.skipReason).toBe("disabled");
  });

  it("takes the LAST packageFiles line of the first base branch and names the others", () => {
    const log = parsed(
      [
        packageFilesLine("acme/webapp", "main", "first"),
        packageFilesLine("acme/webapp", "release", "other"),
        packageFilesLine("acme/webapp", "main", "last"),
      ].join("\n"),
    );
    expect(log.baseBranch).toBe("main");
    expect(log.otherBaseBranches).toEqual(["release"]);
    expect(log.packageFiles[0]?.deps[0]?.depName).toBe("last");
  });

  it("loads the first repository of a multi-repository log", () => {
    const log = parsed(
      [packageFilesLine("acme/one", "", "a"), packageFilesLine("acme/two", "", "b")].join("\n"),
    );
    expect(log.slug).toBe("acme/one");
    expect(log.otherRepositories).toEqual(["acme/two"]);
  });

  it("asks for a debug-level log when there is no packageFiles line", () => {
    const info = FIXTURE.split("\n")
      .filter((text) => !text.includes("packageFiles with updates"))
      .join("\n");
    const result = parseRenovateLog(info);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("LOG_LEVEL=debug");
  });

  it("says so when nothing in the text is JSON", () => {
    const result = parseRenovateLog("INFO: Renovate started\nDEBUG: nothing here");
    expect(result.ok ? "" : result.error).toContain("No JSON log lines");
  });
});
