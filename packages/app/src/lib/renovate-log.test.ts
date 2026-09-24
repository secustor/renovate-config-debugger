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

  it("keeps the updates lookup proposed, aligned with the deps", () => {
    const npm = parsed(FIXTURE).packageFiles.find((file) => file.manager === "npm");
    const at = npm?.deps.findIndex((dep) => dep.depName === "lodash") ?? -1;
    expect(npm?.updates).toHaveLength(npm?.deps.length ?? -1);
    expect(npm?.updates[at]).toEqual([{ updateType: "minor", newValue: "4.18.1" }]);
  });

  it("drops update entries without an updateType", () => {
    const log = parsed(
      line({
        msg: "packageFiles with updates",
        config: {
          npm: [
            {
              packageFile: "package.json",
              deps: [
                {
                  depName: "a",
                  updates: [{ newValue: "2" }, { updateType: "lockFileMaintenance" }],
                },
              ],
            },
          ],
        },
      }),
    );
    expect(log.packageFiles[0]?.updates).toEqual([
      [{ updateType: "lockFileMaintenance", newValue: "" }],
    ]);
  });

  it("reads a lone, pretty-printed packageFiles entry", () => {
    const entry = JSON.parse(packageFilesLine("", "main", "a")) as unknown;
    const log = parsed(JSON.stringify(entry, null, 2));
    expect(log.baseBranch).toBe("main");
    expect(log.packageFiles[0]?.deps[0]?.depName).toBe("a");
  });

  it("reads the bare { baseBranch, config } copied from Mend's log view", () => {
    const mend = JSON.stringify(
      {
        baseBranch: "main",
        config: {
          mise: [
            {
              deps: [
                {
                  depName: "pnpm",
                  currentValue: "12.5.1",
                  datasource: "npm",
                  updates: [{ updateType: "minor", newValue: "12.6.0" }],
                },
              ],
              packageFile: "mise.toml",
            },
          ],
        },
      },
      null,
      2,
    );
    for (const text of [mend, "```\n" + mend + "\n```", "packageFiles with updates\n" + mend]) {
      const log = parsed(text);
      expect(log.baseBranch).toBe("main");
      expect(log.packageFiles[0]?.fileName).toBe("mise.toml");
      expect(log.packageFiles[0]?.updates).toEqual([[{ updateType: "minor", newValue: "12.6.0" }]]);
    }
  });

  it("does not mistake an unrelated config object for packageFiles", () => {
    expect(parseRenovateLog(line({ config: { extends: ["config:recommended"] } }))).toMatchObject({
      ok: false,
    });
  });

  it("counts the lines it read when none is a packageFiles entry", () => {
    const info = FIXTURE.split("\n")
      .filter((text) => !text.includes("packageFiles with updates"))
      .join("\n");
    expect(parseRenovateLog(info)).toEqual({
      ok: false,
      error:
        "Read 6 log lines, none of them a “packageFiles with updates” entry. Renovate only logs it at debug level.",
      lines: 6,
    });
    expect(parseRenovateLog(line({ msg: "Renovate started" }))).toMatchObject({
      error: expect.stringMatching(/^Read 1 log line, none/),
    });
  });

  it("says so when nothing in the text is JSON", () => {
    expect(parseRenovateLog("INFO: Renovate started\nDEBUG: nothing here")).toEqual({
      ok: false,
      error: "Couldn’t read this as JSON — expected one JSON object per line (LOG_FORMAT=json).",
      lines: 0,
    });
  });
});
