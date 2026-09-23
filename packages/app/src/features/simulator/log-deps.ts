/**
 * Roadmap 095 — a parsed Renovate log as the same `RepoDepsView` a repository
 * walk produces, so every discovery surface renders it unchanged.
 */
import type { PackageDependency } from "@renovate-config-debugger/engine";
import type { RenovateLog } from "@/lib/renovate-log";
import { EMPTY_REPO_DEPS, repoDepsOfFile } from "./repo-deps";
import type { RepoDep, RepoDepFile, RepoDepsView } from "@/types/repo";

/** Custom-manager types as the log keys them; the walk labels them `custom.<type>`. */
const CUSTOM_TYPES: ReadonlySet<string> = new Set(["regex", "jsonata"]);

/** Skip reasons set by config or lookup rather than extraction — a config
 *  edit can undo them, so the dep stays pinnable. */
const LOOKUP_SKIP_REASONS: ReadonlySet<string> = new Set([
  "disabled",
  "ignored",
  "package-rules",
  "github-token-required",
  "internal-error",
]);

function managerLabel(manager: string): string {
  return CUSTOM_TYPES.has(manager) ? `custom.${manager}` : manager;
}

function extractionOnly(dep: PackageDependency): PackageDependency {
  if (dep.skipReason === undefined || !LOOKUP_SKIP_REASONS.has(dep.skipReason)) {
    return dep;
  }
  const { skipReason: _lookupOnly, ...rest } = dep;
  return rest;
}

/** `managersConsidered` is approximate: a log's stats name only the managers
 *  that matched files, so no "N other managers matched nothing" is derivable. */
export function logDepsView(log: RenovateLog, pinnedVersion: string | null): RepoDepsView {
  const deps: RepoDep[] = [];
  const files: RepoDepFile[] = [];
  for (const file of log.packageFiles) {
    const manager = managerLabel(file.manager);
    const rows = repoDepsOfFile(
      { ...file, manager, deps: file.deps.map(extractionOnly) },
      (index) => file.updates[index] ?? [],
    );
    deps.push(...rows);
    files.push({
      path: file.fileName,
      managers: [manager],
      depCount: rows.length,
      outcome: rows.length > 0 ? "extracted" : "no-deps",
      // Counted over the rows, so the overlay's columns agree with each other.
      updateCount: rows.reduce((sum, row) => sum + (row.updates?.length ?? 0), 0),
    });
  }
  const named = [...log.managers, ...log.packageFiles.map((file) => file.manager)];
  const builtIn = new Set(named.filter((manager) => !CUSTOM_TYPES.has(manager)));
  return {
    ...EMPTY_REPO_DEPS,
    status: "ready",
    source: {
      kind: "log",
      slug: log.slug,
      renovateVersion: log.renovateVersion,
      pinnedVersion,
      baseBranch: log.baseBranch,
      otherBaseBranches: log.otherBaseBranches,
    },
    repo: log.slug ?? "",
    deps,
    files,
    managersConsidered: builtIn.size,
  };
}
