import { describe, expect, it } from "vitest";
import { SAMPLE_LOG } from "@/data/sample-renovate-log";
import { parseRenovateLog, type RenovateLog } from "@/lib/renovate-log";
import { logDepsView } from "./log-deps";

describe("the overlay's sample log", () => {
  const result = parseRenovateLog(SAMPLE_LOG);
  const log = result.ok ? result.log : null;

  it("names no repository and carries a Renovate version", () => {
    expect(log?.slug).toBeNull();
    expect(log?.renovateVersion).toBe("44.97.5");
  });

  it("covers several managers, with and without updates", () => {
    const view = log === null ? null : logDepsView(log, null);
    expect(view?.files.map((file) => [file.managers[0], file.depCount, file.updateCount])).toEqual([
      ["npm", 3, 2],
      ["github-actions", 1, 1],
      ["dockerfile", 1, 0],
    ]);
  });
});

const LOG: RenovateLog = {
  renovateVersion: "44.97.5",
  slug: null,
  baseBranch: null,
  otherBaseBranches: [],
  otherRepositories: [],
  managers: ["dockerfile", "npm", "regex"],
  packageFiles: [
    {
      manager: "dockerfile",
      fileName: "Dockerfile",
      deps: [{ depName: "node", currentValue: "18", skipReason: "disabled" }],
      updates: [[]],
    },
    {
      manager: "npm",
      fileName: "package.json",
      packageFileVersion: "1.0.0",
      deps: [
        { depName: "lodash", currentValue: "4.17.15", datasource: "npm" },
        { depName: "internal-lib", skipReason: "unspecified-version" },
      ],
      updates: [
        [
          { updateType: "patch", newValue: "4.17.21" },
          { updateType: "digest", newValue: "" },
        ],
        [],
      ],
    },
    { manager: "npm", fileName: "docs/package.json", deps: [], updates: [] },
    {
      manager: "regex",
      fileName: "versions.env",
      deps: [
        { depName: "helm/helm", currentValue: "v3.10.0", skipReason: "github-token-required" },
      ],
      updates: [[]],
    },
  ],
};

describe("logDepsView", () => {
  const view = logDepsView(LOG, "44.97.5");

  it("is a ready, log-sourced view without a slug", () => {
    expect(view.status).toBe("ready");
    expect(view.repo).toBe("");
    expect(view.source).toMatchObject({ kind: "log", slug: null, renovateVersion: "44.97.5" });
  });

  it("keeps deps skipped by config or lookup, drops extraction skips", () => {
    expect(view.deps.map((dep) => dep.depName)).toEqual(["node", "lodash", "helm/helm"]);
  });

  it("labels custom managers the way the walk does", () => {
    expect(view.deps.find((dep) => dep.depName === "helm/helm")?.manager).toBe("custom.regex");
  });

  it("records one file per packageFile, with its outcome", () => {
    expect(view.files.map((file) => [file.path, file.managers, file.outcome])).toEqual([
      ["Dockerfile", ["dockerfile"], "extracted"],
      ["package.json", ["npm"], "extracted"],
      ["docs/package.json", ["npm"], "no-deps"],
      ["versions.env", ["custom.regex"], "extracted"],
    ]);
  });

  it("carries each dep's logged updates onto its row, by dep index", () => {
    expect(view.deps.find((dep) => dep.depName === "lodash")?.updates).toEqual([
      { updateType: "patch", newValue: "4.17.21" },
      { updateType: "digest", newValue: "" },
    ]);
    expect(view.deps.find((dep) => dep.depName === "node")?.updates).toEqual([]);
  });

  it("counts updates per file over the rows it shows", () => {
    expect(view.files.map((file) => [file.path, file.depCount, file.updateCount])).toEqual([
      ["Dockerfile", 1, 0],
      ["package.json", 1, 2],
      ["docs/package.json", 0, 0],
      ["versions.env", 1, 0],
    ]);
  });

  it("counts the built-in managers the log names", () => {
    expect(view.managersConsidered).toBe(2);
    expect(view.customManagersConsidered).toBe(0);
  });
});
