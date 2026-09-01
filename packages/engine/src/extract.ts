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
 *
 * Roadmap 063 adds the user's own `customManagers` blocks alongside: the walk
 * matches their `managerFilePatterns` too, and `extractCustomDeps` runs one
 * block over one file with the block itself as the extractor's config.
 */
import { enqueueEngineTask } from "./pipeline";
import {
  customManagerExtractors,
  type CustomManagerType,
  getMatchingFiles,
  managerDefaultConfigs,
  managerExtractors,
  memCache,
  type PackageDependency,
  type PackageFileContent,
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
 * One `customManagers[]` block, as it arrives from a RESOLVED config: data,
 * not a validated shape — the three fields the engine reads are declared, the
 * rest (matchStrings, fileFormat, the `*Template` keys) rides along untouched
 * because upstream's extractor reads them off the block itself.
 */
export interface CustomManagerInput {
  customType?: unknown;
  managerFilePatterns?: unknown;
  enabled?: unknown;
  [field: string]: unknown;
}

/** The manager label a custom block extracts under, as upstream names it. */
export function customManagerName(type: CustomManagerType): string {
  return `custom.${type}`;
}

// One line to extend if upstream adds a third customType — `customManagerExtractors`
// is the ledger; this narrows the untrusted `customType` value onto its keys.
function customManagerType(block: CustomManagerInput): CustomManagerType | null {
  const type = block.customType;
  if (type === "regex" || type === "jsonata") {
    return type;
  }
  return null;
}

/** `managerFilePatterns` as `getMatchingFiles` wants it: minimatch-or-`/regex/`
 *  strings, defensively filtered — a resolved config can hold anything. */
function customFilePatterns(block: CustomManagerInput): string[] {
  const patterns = block.managerFilePatterns;
  if (!Array.isArray(patterns)) {
    return [];
  }
  return patterns.filter((pattern): pattern is string => typeof pattern === "string");
}

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

/** One path a repo walk kept, and the extractable managers that claim it —
 *  several managers legitimately claim one filename. */
export interface ExtractableMatch {
  path: string;
  /** In upstream's manager order, then the custom ones (`custom.regex`,
   *  `custom.jsonata`, deduped per path); never empty. */
  managers: string[];
  /** Indexes into `opts.customManagers` of the blocks that claim this path —
   *  which blocks the caller must run over it. Absent when none do. */
  customBlocks?: number[];
}

/** What one walk over a repository's file listing found. */
export interface ExtractableWalk {
  /** How many managers the walk ASKED: the extractable ledger minus the
   *  default-disabled and the pattern-less ones, neither of which a filename
   *  walk can ever match. The honest denominator for "K of N managers matched
   *  files". */
  managersConsidered: number;
  /** How many of `opts.customManagers` cleared the same bar: enabled, a
   *  supported customType, at least one file pattern. 0 when none were given. */
  customManagersConsidered: number;
  /** The claimed paths, in input order. */
  files: ExtractableMatch[];
}

export interface ExtractableWalkOptions {
  /** The resolved config's `customManagers` blocks, in config order — the
   *  order `customBlocks` indexes into. */
  customManagers?: readonly CustomManagerInput[];
}

/**
 * The repo walk's bulk form of `matchManagersForFile`: which EXTRACTABLE
 * managers claim each of these paths? One `getMatchingFiles` pass per manager
 * over the whole list — per-path calls would rebuild the manager table, the
 * subset Set and the per-pattern debug strings tens of thousands of times on a
 * large tree. Input order is preserved.
 *
 * Returns the attribution rather than the bare path list: the walk's own
 * accounting (roadmap 090's Extract phase) has to say WHICH manager claimed a
 * file, and recovering that per path afterwards is exactly the per-path scan
 * this shape exists to avoid.
 */
export function matchExtractableManagers(
  paths: readonly string[],
  opts?: ExtractableWalkOptions,
): ExtractableWalk {
  return withCollectorSuppressed(() => {
    const all = [...paths];
    const claims = new Map<string, string[]>();
    const blockClaims = new Map<string, number[]>();
    let managersConsidered = 0;
    let customManagersConsidered = 0;
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
      managersConsidered += 1;
      for (const file of getMatchingFiles({ manager, managerFilePatterns: patterns }, all)) {
        const claimed = claims.get(file);
        if (claimed === undefined) {
          claims.set(file, [manager]);
        } else {
          claimed.push(manager);
        }
      }
    }
    // The user's own managers, after the built-ins so each path's list stays
    // upstream-order-then-custom. Same one-pass-per-manager shape.
    for (const [index, block] of (opts?.customManagers ?? []).entries()) {
      const type = customManagerType(block);
      if (type === null || block.enabled === false) {
        continue;
      }
      const patterns = customFilePatterns(block);
      if (patterns.length === 0) {
        continue;
      }
      customManagersConsidered += 1;
      const manager = customManagerName(type);
      for (const file of getMatchingFiles({ manager, managerFilePatterns: patterns }, all)) {
        const claimed = claims.get(file);
        if (claimed === undefined) {
          claims.set(file, [manager]);
        } else if (!claimed.includes(manager)) {
          // One label per custom TYPE per path — two regex blocks claiming one
          // file are two entries in `customBlocks`, not two `custom.regex`.
          claimed.push(manager);
        }
        const blocks = blockClaims.get(file);
        if (blocks === undefined) {
          blockClaims.set(file, [index]);
        } else {
          blocks.push(index);
        }
      }
    }
    const files: ExtractableMatch[] = [];
    for (const path of paths) {
      const managers = claims.get(path);
      if (managers !== undefined) {
        const blocks = blockClaims.get(path);
        files.push({ path, managers, ...(blocks === undefined ? {} : { customBlocks: blocks }) });
      }
    }
    return { managersConsidered, customManagersConsidered, files };
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

/** The success shape both extraction paths return, massaged as upstream does. */
function extractedFile(
  manager: string,
  fileName: string,
  result: PackageFileContent,
): ExtractedPackageFile {
  massageDepNames(result.deps);
  return {
    manager,
    fileName,
    deps: result.deps,
    ...(result.datasource === undefined ? {} : { datasource: result.datasource }),
    ...(result.packageFileVersion === undefined
      ? {}
      : { packageFileVersion: result.packageFileVersion }),
  };
}

/**
 * A fresh store and a fresh memory cache per extraction: github-actions
 * memoizes a lockfile-read PROMISE under a fixed cache key, so a stale cache
 * would let one extraction see another's files. Seeds through upstream's own
 * `writeLocalFile`, the door every manager reads back through.
 */
async function withSeededFiles<T>(
  files: readonly ExtractFile[],
  run: () => Promise<T>,
): Promise<T> {
  resetLocalFiles();
  memCache.init();
  try {
    for (const file of files) {
      await writeLocalFile(file.fileName, file.content);
    }
    return await run();
  } finally {
    memCache.reset();
    resetLocalFiles();
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

  const files = [
    { fileName: request.fileName, content: request.content },
    ...(request.supportFiles ?? []),
  ];
  try {
    return await withSeededFiles<ExtractOutcome>(files, async () => {
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
      return { ok: true, file: extractedFile(manager, request.fileName, result) };
    });
  } catch (err) {
    return {
      ok: false,
      reason: "extract-error",
      matchedManagers: matched(),
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface ExtractCustomRequest extends ExtractFile {
  /** The `customManagers[]` block to run: it IS the extractor's config —
   *  matchStrings, fileFormat and the `*Template` fields are read off it. */
  block: CustomManagerInput;
}

/**
 * `extractDeps` for ONE custom-manager block. Queued on the same engine lane
 * for the same reason: extraction touches module-level renovate state.
 * The caller decides which blocks claim the file (`matchExtractableManagers`);
 * this runs the one it is handed, patterns and all, and never re-matches.
 */
export function extractCustomDeps(
  request: ExtractCustomRequest,
  signal?: AbortSignal,
): Promise<ExtractOutcome> {
  return enqueueEngineTask(() => runCustomExtract(request), signal);
}

async function runCustomExtract(request: ExtractCustomRequest): Promise<ExtractOutcome> {
  const type = customManagerType(request.block);
  if (type === null) {
    const raw = request.block.customType;
    return {
      ok: false,
      reason: "unsupported-manager",
      matchedManagers: [],
      message:
        typeof raw === "string"
          ? `customType "${raw}" is not a custom manager this engine can run`
          : "custom manager block has no customType",
    };
  }
  const manager = customManagerName(type);
  const files = [{ fileName: request.fileName, content: request.content }];
  try {
    return await withSeededFiles<ExtractOutcome>(files, async () => {
      const extract = customManagerExtractors[type];
      // The block itself is the config — that is the whole point of a custom
      // manager. A bad matchStrings pattern THROWS; the catch below owns it.
      const result = await extract(request.content, request.fileName, request.block);
      if (!result || !Array.isArray(result.deps) || result.deps.length === 0) {
        return {
          ok: false,
          reason: "no-deps",
          matchedManagers: [manager],
          message: `${manager} found no dependencies in ${request.fileName}`,
        };
      }
      return { ok: true, file: extractedFile(manager, request.fileName, result) };
    });
  } catch (err) {
    return {
      ok: false,
      reason: "extract-error",
      matchedManagers: [manager],
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
