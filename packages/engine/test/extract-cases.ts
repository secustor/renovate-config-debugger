/**
 * The shared fixture table for the extraction golden/shimmed pair (roadmap
 * 078): one real package file per mapped manager. Golden runs it with the
 * REAL renovate modules (fs reads under GlobalConfig.localDir) and writes the
 * file snapshots; shimmed runs the browser module graph (in-memory fs) and
 * must reproduce them byte-for-byte — these double as the drift net for
 * Renovate bump PRs.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXTRACT_CASES_A } from "./extract-cases-a";
import { EXTRACT_CASES_B } from "./extract-cases-b";
import { EXTRACT_CASES_C } from "./extract-cases-c";

export interface ExtractCase {
  /**
   * path under fixtures/extract/, written as the file is NAMED in a real repo
   * (the broad sweep groups by manager subdir); on disk every fixture carries
   * an extra `.fixture` suffix, which `extractFixture` appends.
   */
  fixture: string;
  /** the repo-relative path the file is extracted AS */
  fileName: string;
  manager: string;
  /** depNames that must be among the extracted deps */
  expectDeps: string[];
}

/** The original 078 launch set; the broad sweep's batches follow below. */
const CORE_CASES: ExtractCase[] = [
  {
    fixture: "package.json",
    fileName: "package.json",
    manager: "npm",
    expectDeps: ["lodash", "react", "typescript", "vitest"],
  },
  {
    fixture: "Dockerfile",
    fileName: "Dockerfile",
    manager: "dockerfile",
    expectDeps: ["node", "golang"],
  },
  {
    fixture: "ci.yml",
    fileName: ".github/workflows/ci.yml",
    manager: "github-actions",
    expectDeps: ["actions/checkout", "actions/setup-node"],
  },
  {
    fixture: "go.mod",
    fileName: "go.mod",
    manager: "gomod",
    expectDeps: ["github.com/pkg/errors", "golang.org/x/mod"],
  },
  {
    fixture: "requirements.txt",
    fileName: "requirements.txt",
    manager: "pip_requirements",
    expectDeps: ["requests", "flask", "urllib3"],
  },
  {
    fixture: "pyproject.toml",
    fileName: "pyproject.toml",
    manager: "pep621",
    expectDeps: ["httpx", "pydantic", "pytest"],
  },
  {
    fixture: "values.yaml",
    fileName: "values.yaml",
    manager: "helm-values",
    expectDeps: ["nginx"],
  },
  {
    fixture: "Cargo.toml",
    fileName: "Cargo.toml",
    manager: "cargo",
    expectDeps: ["serde", "tokio", "insta"],
  },
  {
    fixture: "App.csproj",
    fileName: "src/App/App.csproj",
    manager: "nuget",
    expectDeps: ["Newtonsoft.Json", "Serilog"],
  },
  {
    fixture: "pom.xml",
    fileName: "pom.xml",
    manager: "maven",
    expectDeps: ["org.apache.commons:commons-lang3", "com.google.guava:guava"],
  },
];

export const EXTRACT_CASES: ExtractCase[] = [
  ...CORE_CASES,
  ...EXTRACT_CASES_A,
  ...EXTRACT_CASES_B,
  ...EXTRACT_CASES_C,
];

/**
 * Reads a fixture by the name the file carries in a real repo. The `.fixture`
 * suffix on disk is what keeps these out of dependency scanners: a `go.mod`,
 * `pom.xml`, `Cargo.lock` or `requirements.txt` sitting in the tree is read as
 * one of THIS repo's manifests (osv-scanner reported CVEs against the pinned
 * versions here), so the bytes stay real while the file name is not a manifest
 * name. Keep the suffix when adding a fixture.
 */
export function extractFixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "fixtures", "extract", `${name}.fixture`), "utf8");
}

export function extractSnapshotPath(manager: string): string {
  return `__snapshots__/extract-${manager}.json`;
}
