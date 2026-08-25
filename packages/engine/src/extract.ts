/**
 * Built-in manager extraction (roadmap 078): run Renovate's own
 * `extractPackageFile` over a real package file, so pins and simulations use
 * the names and values production Renovate would — not the user's guess at
 * them.
 *
 * Single-file semantics, stated honestly: each call extracts ONE file, with
 * optional support files (lockfiles, `.cargo/config.toml`, `.npmrc`) resolved
 * against renovate's fs module — the in-memory shims/fs.ts store in the
 * browser graph, the real fs under `GlobalConfig.localDir` in the golden test
 * project. Multi-file managers without an internal single-file function
 * (gradle, sbt, …) report `unsupported-manager` — the conda precedent: an
 * honest gap, not a wrong answer.
 */
import { enqueueEngineTask } from "./pipeline";
import {
  getMatchingFiles,
  managerDefaultConfigs,
  managerExtractors,
  memCache,
  type PackageDependency,
  writeLocalFile,
} from "./renovate-adapter";
import { resetLocalFiles } from "./shims/fs";
import { withCollectorSuppressed } from "./trace/collector";

export interface ExtractFile {
  /** repo-relative path, e.g. `packages/app/package.json` */
  fileName: string;
  content: string;
}

export interface ExtractRequest extends ExtractFile {
  /**
   * Sibling/support files some managers read during extraction. Present if
   * the caller has them, gracefully absent otherwise — no pretending a single
   * file is a repository.
   */
  supportFiles?: ExtractFile[];
  /** Manager override; defaults to the first extractable match for fileName. */
  manager?: string;
}

export interface ExtractedPackageFile {
  manager: string;
  fileName: string;
  deps: PackageDependency[];
  /** File-level datasource default some managers set (maven). */
  datasource?: string;
  packageFileVersion?: string;
}

export type ExtractOutcome =
  | { ok: true; file: ExtractedPackageFile }
  | {
      ok: false;
      reason: "no-manager" | "unsupported-manager" | "no-deps" | "extract-error";
      /** The managers whose file patterns matched, for honest reporting. */
      matchedManagers: string[];
      message: string;
    };

/** The managers the browser engine can run — the curated 078 launch set. */
export const EXTRACTABLE_MANAGERS: readonly string[] = Object.keys(managerExtractors);

/**
 * Upstream's cheap path-only step: which managers' `managerFilePatterns`
 * match this path? Iterates the generated default configs (already bundled)
 * through renovate's own `getMatchingFiles`, in upstream's manager order.
 * Matches ALL managers, extractable or not — the caller decides what an
 * unmapped match means. `opts.among` restricts the scan to a subset (a repo
 * walk testing thousands of paths against only the extractable managers stays
 * cheap that way).
 */
export function matchManagersForFile(
  fileName: string,
  opts?: { among?: readonly string[] },
): string[] {
  // Suppressed: getMatchingFiles logs one debug line PER PATTERN, and this
  // runs outside any engine run — those lines must not land in a
  // concurrently active run's trace.
  return withCollectorSuppressed(() => {
    const matched: string[] = [];
    const among = opts?.among === undefined ? null : new Set(opts.among);
    for (const [manager, config] of Object.entries(managerDefaultConfigs)) {
      if (among !== null && !among.has(manager)) {
        continue;
      }
      const patterns = config.managerFilePatterns;
      if (!patterns || patterns.length === 0) {
        continue;
      }
      const files = getMatchingFiles({ manager, managerFilePatterns: patterns }, [fileName]);
      if (files.length > 0) {
        matched.push(manager);
      }
    }
    return matched;
  });
}

/**
 * The repo walk's bulk form of the same question: which of these paths does
 * at least one EXTRACTABLE manager claim? One `getMatchingFiles` pass per
 * manager over the whole list — per-path calls would rebuild the manager
 * table, the subset Set and the per-pattern debug strings tens of thousands
 * of times on a large tree. Input order is preserved.
 */
export function matchExtractablePaths(paths: readonly string[]): string[] {
  return withCollectorSuppressed(() => {
    const all = [...paths];
    const matched = new Set<string>();
    for (const [manager, config] of Object.entries(managerDefaultConfigs)) {
      if (!(manager in managerExtractors)) {
        continue;
      }
      // Default-disabled managers (azure-pipelines, pre-commit) stay out of
      // the WALK: production Renovate never runs them without an explicit
      // opt-in, so their files must not claim "detected" rows or spend the
      // fetch cap. An explicit `extractDeps({ manager })` still reaches them.
      if (config.enabled === false) {
        continue;
      }
      const patterns = config.managerFilePatterns;
      if (!patterns || patterns.length === 0) {
        continue;
      }
      for (const file of getMatchingFiles({ manager, managerFilePatterns: patterns }, all)) {
        matched.add(file);
      }
    }
    return paths.filter((path) => matched.has(path));
  });
}

/**
 * Upstream's one post-extract step worth replicating (`massageDepNames` in
 * workers/repository/extract/manager-files.js): `packageName` → `depName`
 * when `depName` is unset.
 */
function massageDepNames(deps: PackageDependency[]): void {
  for (const dep of deps) {
    if (dep.packageName && !dep.depName) {
      dep.depName = dep.packageName;
    }
  }
}

/**
 * Queued like `runPipeline`/`simulatePackageRules`: extraction touches the
 * same module-level renovate state (memCache, the fs store, the logger's
 * collector), so it must never overlap another engine task — an unqueued
 * extraction finishing mid-run would leave the run's memCache disabled, and
 * two overlapping discoveries would wipe each other's file store.
 */
export function extractDeps(
  request: ExtractRequest,
  signal?: AbortSignal,
): Promise<ExtractOutcome> {
  return enqueueEngineTask(() => runExtract(request), signal);
}

async function runExtract(request: ExtractRequest): Promise<ExtractOutcome> {
  // Lazy: the full-manager scan only runs when the outcome needs it — manager
  // selection, or the honest matched-list on a failure report. An explicit
  // `request.manager` success path skips it entirely.
  let matchedCache: string[] | null = null;
  const matched = (): string[] => (matchedCache ??= matchManagersForFile(request.fileName));
  const manager = request.manager ?? matched().find((m) => m in managerExtractors);
  if (manager === undefined) {
    return matched().length === 0
      ? {
          ok: false,
          reason: "no-manager",
          matchedManagers: matched(),
          message: `no manager's file patterns match ${request.fileName}`,
        }
      : {
          ok: false,
          reason: "unsupported-manager",
          matchedManagers: matched(),
          message:
            `${request.fileName} matches ${matched().join(", ")} — ` +
            "not supported in the browser engine",
        };
  }
  const loadExtractor = managerExtractors[manager];
  if (loadExtractor === undefined) {
    return {
      ok: false,
      reason: "unsupported-manager",
      matchedManagers: matched(),
      message: `${manager} is not supported in the browser engine`,
    };
  }

  // A fresh store and a fresh memory cache per run: github-actions memoizes a
  // lockfile-read PROMISE under a fixed cache key, so a stale cache would let
  // one extraction see another's files.
  resetLocalFiles();
  memCache.init();
  try {
    await writeLocalFile(request.fileName, request.content);
    for (const support of request.supportFiles ?? []) {
      await writeLocalFile(support.fileName, support.content);
    }
    const extract = await loadExtractor();
    const result = await extract(request.content, request.fileName, {});
    if (!result || !Array.isArray(result.deps) || result.deps.length === 0) {
      return {
        ok: false,
        reason: "no-deps",
        matchedManagers: matched(),
        message: `${manager} found no dependencies in ${request.fileName}`,
      };
    }
    massageDepNames(result.deps);
    return {
      ok: true,
      file: {
        manager,
        fileName: request.fileName,
        deps: result.deps,
        ...(result.datasource === undefined ? {} : { datasource: result.datasource }),
        ...(result.packageFileVersion === undefined
          ? {}
          : { packageFileVersion: result.packageFileVersion }),
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason: "extract-error",
      matchedManagers: matched(),
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    memCache.reset();
    resetLocalFiles();
  }
}
