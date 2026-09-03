/**
 * Roadmap 078 — the From-repository picker's discovery: walk the loaded
 * repository's git tree, keep the paths the EXTRACTABLE managers claim, fetch
 * those files and run Renovate's own extraction over each. Feature-local: this
 * hook computes the view; its contract types (`RepoDep`, `RepoDepFile`,
 * `RepoDepsView`, `LoadedRepo`) live in `src/types/repo.ts` so the shell can
 * hold the result without importing the feature's internals, and
 * `repo-deps.ts` holds the pure `PackageDependency → FormState` mapping.
 *
 * Discovery is ON DEMAND — `ensure()` fires when the reader opens the tab,
 * never on the load itself: a tab nobody opens must not spend the rate limit.
 * One discovery per loaded repo AND per custom-manager set (roadmap 093: the
 * blocks are config, so an edit that changes them has to re-walk); a new load
 * or a changed set invalidates the old one by KEY (the stale report simply
 * stops being the displayed view), so nothing here writes state during render —
 * and a superseded discovery's late settlement is dropped by attempt token, so
 * it can never clobber the fresh view.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { jsonText } from "@renovate-config-debugger/engine/json";
import { TREE_LISTING_PLATFORMS } from "@/data/host-tokens";
import { EMPTY_REPO_DEPS, repoDepsOfFile } from "./repo-deps";
import { useLatestRef } from "@/hooks/use-latest-ref";
import { loadEngine } from "@/platform/engine-chunk";
import { loadRepoFile, loadRepoTree } from "@/platform/run";
import { causedErrorMessage } from "@/lib/errors";
import type { ExtractOutcome } from "@renovate-config-debugger/engine";
import type { LoadedRepo, RepoDep, RepoDepFile, RepoDepsView } from "@/types/repo";

/** The `customManagers[]` blocks a run resolved, as discovery takes them:
 *  plain objects, validated no further — the engine reads what it needs. */
export type CustomManagerBlocks = readonly Record<string, unknown>[];

/** Every matched file is fetched by default; this is only a runaway backstop
 *  for pathological monorepos (each file is one request, and an anonymous
 *  GitHub session has 60 an hour). The view counts anything it drops. */
const MAX_REPO_DEP_FILES = 500;

/** What became of one matched file — the ledger entry the walk's own record
 *  (`path`, `managers`) is completed with. `error` carries the engine's reason
 *  for an EXTRACTION failure only; a file that was never fetched (`not-read`,
 *  `unreadable`) has none. */
type FileLedger = Pick<RepoDepFile, "outcome" | "extractedBy" | "depCount" | "error">;

/** A matched file the cap dropped: claimed, never fetched, so nothing at all
 *  is known about what is inside it. */
const NOT_READ: FileLedger = {
  outcome: "not-read",
  extractedBy: null,
  depCount: 0,
};

/** Renovate's own default ignorePaths, applied to the walk. */
const IGNORED_PATH = /(^|\/)(node_modules|bower_components)\//;

export interface RepoDeps {
  view: RepoDepsView;
  /** Kick discovery off if it has not run for the current repo yet. */
  ensure: () => void;
}

function repoKey(repo: LoadedRepo): string {
  return `${repo.platform}:${repo.repo}@${repo.ref ?? ""}:${repo.endpoint ?? ""}`;
}

/** The discovery's identity: the repository AND the custom managers the walk
 *  was given, so a config edit that changes the blocks re-discovers while a
 *  re-run with the same ones keeps the report already on screen. */
function discoveryKey(repo: LoadedRepo, customManagers: CustomManagerBlocks): string {
  let blocks = `${customManagers.length}`;
  try {
    blocks = jsonText(customManagers);
  } catch {
    // A config value that cannot be serialized still has to key something.
  }
  return `${repoKey(repo)}|${blocks}`;
}

/** What ONE extraction run over a file produced — a built-in's, or one custom
 *  block's. `rows` is the PINNABLE rows, which can be 0 on a real extraction. */
export type FileRun =
  | { status: "extracted"; manager: string; rows: number }
  | { status: "no-deps" }
  | { status: "error"; message?: string };

/**
 * The ledger entry for a file several extractors ran over (roadmap 093): a
 * built-in and every custom block that claimed it. Extracted if ANY run
 * extracted, else errored if any failed; `extractedBy` names the first run that
 * produced rows (falling back to the first that ran at all, which is the
 * all-rows-skipped case), and `depCount` totals every run. A failure's reason
 * survives only when nothing extracted beside it — the ledger has one outcome,
 * so a message under an `extracted` entry would describe a row it contradicts.
 */
export function mergeFileRuns(runs: readonly FileRun[]): FileLedger {
  const extracted = runs.filter((run) => run.status === "extracted");
  if (extracted.length === 0) {
    const failed = runs.find((run) => run.status === "error");
    return {
      outcome: failed === undefined ? "no-deps" : "error",
      extractedBy: null,
      depCount: 0,
      ...(failed?.message === undefined ? {} : { error: failed.message }),
    };
  }
  const first = extracted.find((run) => run.rows > 0) ?? extracted[0];
  return {
    outcome: "extracted",
    extractedBy: first?.manager ?? null,
    depCount: extracted.reduce((total, run) => total + run.rows, 0),
  };
}

/** An extraction that produced nothing, as the ledger records it. Upstream's
 *  `unsupported-manager`/`no-manager` are failures, not emptiness — and their
 *  engine-phrased messages ride the same field as a broken `matchStrings`, the
 *  one failure here whose cause is the reader's own config. */
function failedRun(outcome: Extract<ExtractOutcome, { ok: false }>): FileRun {
  return outcome.reason === "no-deps"
    ? { status: "no-deps" }
    : { status: "error", message: outcome.message };
}

async function discover(
  repo: LoadedRepo,
  customManagers: CustomManagerBlocks,
): Promise<RepoDepsView> {
  const engine = await loadEngine();
  const opts = { suppressTokens: repo.suppressTokens };
  const request = {
    platform: repo.platform,
    repo: repo.repo,
    ...(repo.endpoint === undefined ? {} : { endpoint: repo.endpoint }),
    ...(repo.ref === undefined ? {} : { ref: repo.ref }),
  };
  const tree = await loadRepoTree(request, opts);
  // One bulk pass over the tree (per-manager, inside the engine) — a
  // per-path scan would rebuild the manager table and its per-pattern debug
  // strings tens of thousands of times on a large tree. It hands back the
  // ATTRIBUTION (which managers claim each path), which is what the Extract
  // phase's first node reports on.
  const walk = engine.matchExtractableManagers(
    tree.paths.filter((path) => !IGNORED_PATH.test(path)),
    { customManagers },
  );
  // Shallowest first (tree order as the tiebreak) before the cap: GitHub
  // lists the tree lexicographically, so ten `.github/workflows/*.yml`
  // files would otherwise spend the whole budget before `package.json` is
  // even reached.
  const taken = walk.files
    .map((match, index) => ({ match, index, depth: match.path.split("/").length }))
    .toSorted((a, b) => a.depth - b.depth || a.index - b.index)
    .slice(0, MAX_REPO_DEP_FILES)
    .map((entry) => entry.match);
  // The file fetches are independent GETs — issued together. Extraction
  // stays sequential below: the engine serializes it (module-level renovate
  // state) against every other engine task.
  const contents = await Promise.all(
    taken.map((match) => loadRepoFile({ ...request, path: match.path }, opts)),
  );
  const deps: RepoDep[] = [];
  // What each READ file turned into, keyed by path; the files nothing is
  // recorded for are the ones the cap dropped (`not-read` below). Every count
  // a surface prints is derived from this ledger (`lib/discovery-caveats.ts`),
  // never accumulated beside it.
  const read = new Map<string, FileLedger>();
  const record = (outcome: ExtractOutcome): FileRun => {
    if (!outcome.ok) {
      return failedRun(outcome);
    }
    const rows = repoDepsOfFile(outcome.file);
    deps.push(...rows);
    return { status: "extracted", manager: outcome.file.manager, rows: rows.length };
  };
  for (const [index, match] of taken.entries()) {
    const path = match.path;
    const content = contents[index] ?? null;
    if (content === null) {
      read.set(path, { outcome: "unreadable", extractedBy: null, depCount: 0 });
      continue;
    }
    const runs: FileRun[] = [];
    // The built-in pass only when a built-in claimed the file: a custom-only
    // path would come straight back `no-manager` and spend a queue slot on it.
    if (match.managers.some((manager) => !manager.startsWith("custom."))) {
      runs.push(record(await engine.extractDeps({ fileName: path, content })));
    }
    // Then every block that claimed it — two regex blocks legitimately both
    // extract from one file, so this is per BLOCK, not per custom label.
    for (const block of match.customBlocks ?? []) {
      const config = customManagers[block];
      if (config !== undefined) {
        runs.push(
          record(await engine.extractCustomDeps({ fileName: path, content, block: config })),
        );
      }
    }
    read.set(path, mergeFileRuns(runs));
  }
  const files: RepoDepFile[] = walk.files.map((match) => ({
    path: match.path,
    managers: match.managers,
    ...(read.get(match.path) ?? NOT_READ),
  }));
  return {
    status: "ready",
    repo: repo.repo,
    deps,
    files,
    managersConsidered: walk.managersConsidered,
    customManagersConsidered: walk.customManagersConsidered,
    truncated: tree.truncated,
    error: null,
  };
}

export function useRepoDeps(
  loadedRepo: LoadedRepo | null,
  customManagers: CustomManagerBlocks,
): RepoDeps {
  // Only a platform the engine can LIST gets a picker at all — for the rest
  // the tab keeps its connect panel instead of a walk that can only throw
  // (the deep half of this gate is fetchRepoTree's own GitHub-only guard).
  const listableRepo =
    loadedRepo !== null && TREE_LISTING_PLATFORMS.has(loadedRepo.platform) ? loadedRepo : null;
  // The report is keyed by the repo it describes: a NEW load doesn't reset
  // anything — a stale report just stops being the displayed view below.
  const [state, setState] = useState<{ key: string; view: RepoDepsView } | null>(null);
  const startedFor = useRef<string | null>(null);
  // Every ensure() start mints an attempt; a settlement whose attempt is no
  // longer current is DROPPED. Without it the single state slot lets a slow,
  // superseded discovery overwrite the fresh view — or strand the tab on the
  // idle fallback forever, since `startedFor` already claims the key and the
  // open-tab effect's retry is a no-op.
  const attempt = useRef(0);
  const latestRepo = useLatestRef(listableRepo);
  // Read the same way as the repo: the on-open trigger must walk with the
  // blocks the CURRENT run resolved, never a closure's stale set.
  const latestCustom = useLatestRef(customManagers);

  const ensure = useCallback(() => {
    const repo = latestRepo.current;
    if (repo === null) {
      return;
    }
    const blocks = latestCustom.current;
    const key = discoveryKey(repo, blocks);
    if (startedFor.current === key) {
      return;
    }
    startedFor.current = key;
    const token = ++attempt.current;
    setState({ key, view: { ...EMPTY_REPO_DEPS, status: "loading", repo: repo.repo } });
    void discover(repo, blocks)
      .then((view) => {
        if (attempt.current === token) {
          setState({ key, view });
        }
        return undefined;
      })
      .catch((err: unknown) => {
        if (attempt.current !== token) {
          return;
        }
        // Allow a retry — the failure may be transient (rate limit, network).
        startedFor.current = null;
        // ExternalHostError's own message is the constant
        // "external-host-error"; the cause rides on `.err` — unwrapped here
        // exactly as the load path does.
        setState({
          key,
          view: {
            ...EMPTY_REPO_DEPS,
            status: "error",
            repo: repo.repo,
            error: causedErrorMessage(err),
          },
        });
      });
  }, [latestRepo, latestCustom]);

  // The repo label rides on the view even before discovery ran — `repo` being
  // set is what enables the tab that TRIGGERS discovery. Memoized so the
  // run-view provider's identity only moves on a load or an async report.
  const repoName = listableRepo?.repo ?? "";
  const currentKey = listableRepo === null ? null : discoveryKey(listableRepo, customManagers);
  const view = useMemo(() => {
    const base = state !== null && state.key === currentKey ? state.view : EMPTY_REPO_DEPS;
    return base.repo === repoName ? base : { ...base, repo: repoName };
  }, [state, currentKey, repoName]);

  return { view, ensure };
}
