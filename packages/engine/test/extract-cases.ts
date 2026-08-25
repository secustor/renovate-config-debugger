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

export interface ExtractCase {
  fixture: string;
  /** the repo-relative path the file is extracted AS */
  fileName: string;
  manager: string;
  /** depNames that must be among the extracted deps */
  expectDeps: string[];
}

export const EXTRACT_CASES: ExtractCase[] = [
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

export function extractFixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "fixtures", "extract", name), "utf8");
}

export function extractSnapshotPath(manager: string): string {
  return `__snapshots__/extract-${manager}.json`;
}
