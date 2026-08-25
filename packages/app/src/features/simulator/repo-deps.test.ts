import { describe, expect, it } from "vitest";
import type { ExtractedPackageFile } from "@renovate-config-debugger/engine";
import { depToFill, filterRepoDeps, hiddenDepFiles, repoDepsOfFile } from "./repo-deps";

const FILE: ExtractedPackageFile = {
  manager: "npm",
  fileName: "packages/app/package.json",
  deps: [
    {
      depName: "typescript",
      packageName: "typescript",
      currentValue: "5.8.3",
      datasource: "npm",
      depType: "devDependencies",
    },
    // packageName-only (massageDepNames copies it to depName upstream, but the
    // mapping must not depend on that having happened)
    { packageName: "lodash", currentValue: "^4.17.21", datasource: "npm" },
    // unnameable — cannot be pinned or matched by any rule
    { currentValue: "1.0.0" },
    // digest-only: no currentValue, currentVersion carries the value
    { depName: "node", currentVersion: "20.15.0", datasource: "node-version" },
    // skipped by extraction itself — Renovate never updates a file: link, so
    // the picker must not offer it as a pinnable test
    { depName: "my-lib", currentValue: "file:../my-lib", datasource: "npm", skipReason: "file" },
  ],
};

describe("depToFill", () => {
  it("maps extraction's own fields, the file path and the matched manager", () => {
    const fill = depToFill(FILE, FILE.deps[0] ?? {});
    expect(fill).toEqual({
      manager: "npm",
      packageFile: "packages/app/package.json",
      depName: "typescript",
      packageName: "typescript",
      currentValue: "5.8.3",
      datasource: "npm",
      depType: "devDependencies",
    });
  });

  it("falls back to the file-level datasource and joins registryUrls", () => {
    const file: ExtractedPackageFile = {
      manager: "maven",
      fileName: "pom.xml",
      datasource: "maven",
      deps: [
        {
          depName: "org.apache.commons:commons-lang3",
          currentValue: "3.14.0",
          registryUrls: ["https://repo.example.com", null, ""],
        },
      ],
    };
    const fill = depToFill(file, file.deps[0] ?? {});
    expect(fill.datasource).toBe("maven");
    expect(fill.registryUrls).toBe("https://repo.example.com");
  });

  it("names packageName from depName when extraction set only one", () => {
    const fill = depToFill(FILE, { depName: "node", currentValue: "20" });
    expect(fill.packageName).toBe("node");
    expect(fill.depName).toBe("node");
  });
});

describe("repoDepsOfFile", () => {
  it("keeps only nameable deps, in file order, with the row's meta note", () => {
    const rows = repoDepsOfFile(FILE);
    expect(rows.map((row) => row.depName)).toEqual(["typescript", "lodash", "node"]);
    expect(rows[0]?.meta).toBe("packages/app/package.json · 5.8.3");
    // digest-only rows fall back to currentVersion for the value
    expect(rows[2]?.meta).toBe("packages/app/package.json · 20.15.0");
    // keys are stable and unique across same-named deps in different files
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });
});

describe("filterRepoDeps", () => {
  const rows = repoDepsOfFile(FILE);

  it("matches name, file and manager, case-insensitively", () => {
    expect(filterRepoDeps(rows, "TYPE").map((r) => r.depName)).toEqual(["typescript"]);
    expect(filterRepoDeps(rows, "packages/app")).toHaveLength(3);
    expect(filterRepoDeps(rows, "npm")).toHaveLength(3);
    expect(filterRepoDeps(rows, "nothing-matches")).toHaveLength(0);
  });

  it("returns everything for a blank query", () => {
    expect(filterRepoDeps(rows, "  ")).toHaveLength(3);
  });
});

describe("hiddenDepFiles", () => {
  it("names each hidden row's file once, in row order", () => {
    const rows = [
      ...repoDepsOfFile(FILE),
      ...repoDepsOfFile({ manager: "dockerfile", fileName: "Dockerfile", deps: FILE.deps }),
      ...repoDepsOfFile(FILE),
    ];
    expect(hiddenDepFiles(rows)).toEqual(["packages/app/package.json", "Dockerfile"]);
    expect(hiddenDepFiles([])).toEqual([]);
  });
});
