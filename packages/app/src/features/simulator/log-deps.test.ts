import { describe, expect, it } from "vitest";
import type { RenovateLog } from "@/lib/renovate-log";
import { logDepsView } from "./log-deps";

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
    },
    {
      manager: "npm",
      fileName: "package.json",
      packageFileVersion: "1.0.0",
      deps: [
        { depName: "lodash", currentValue: "4.17.15", datasource: "npm" },
        { depName: "internal-lib", skipReason: "unspecified-version" },
      ],
    },
    { manager: "npm", fileName: "docs/package.json", deps: [] },
    {
      manager: "regex",
      fileName: "versions.env",
      deps: [
        { depName: "helm/helm", currentValue: "v3.10.0", skipReason: "github-token-required" },
      ],
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

  it("counts the built-in managers the log names", () => {
    expect(view.managersConsidered).toBe(2);
    expect(view.customManagersConsidered).toBe(0);
  });
});
