/**
 * Roadmap 078 — the From-repository picker's discovery: walk the loaded
 * repository's git tree, keep the paths the EXTRACTABLE managers claim, fetch
 * those files and run Renovate's own extraction over each. App-shell code by
 * the 085 layering precedent: the feature (`features/simulator/repo-deps.ts`)
 * declares the shapes and draws the rows; this hook computes them.
 *
 * Discovery is ON DEMAND — `ensure()` fires when the reader opens the tab,
 * never on the load itself: a tab nobody opens must not spend the rate limit.
 * One discovery per loaded repo; a new load invalidates the old one by KEY
 * (the stale report simply stops being the displayed view), so nothing here
 * writes state during render — and a superseded discovery's late settlement
 * is dropped by attempt token, so it can never clobber the fresh view.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { TREE_LISTING_PLATFORMS } from "@/data/host-tokens";
import { EMPTY_REPO_DEPS, repoDepsOfFile } from "./repo-deps";
import { useLatestRef } from "@/hooks/use-latest-ref";
import { loadEngine } from "@/platform/engine-chunk";
import { loadRepoFile, loadRepoTree } from "@/platform/run";
import { causedErrorMessage } from "@/lib/errors";
import type { LoadedRepo, RepoDep, RepoDepFile, RepoDepsView } from "@/types/repo";

/** Every matched file is fetched by default; this is only a runaway backstop
 *  for pathological monorepos (each file is one request, and an anonymous
 *  GitHub session has 60 an hour). The view counts anything it drops. */
const MAX_REPO_DEP_FILES = 500;

/** A matched file the cap dropped: claimed, never fetched, so nothing at all
 *  is known about what is inside it. */
const NOT_READ: Pick<RepoDepFile, "outcome" | "extractedBy" | "depCount"> = {
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

async function discover(repo: LoadedRepo): Promise<RepoDepsView> {
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
  );
  // Shallowest first (tree order as the tiebreak) before the cap: GitHub
  // lists the tree lexicographically, so ten `.github/workflows/*.yml`
  // files would otherwise spend the whole budget before `package.json` is
  // even reached.
  const taken = walk.files
    .map((match, index) => ({ path: match.path, index, depth: match.path.split("/").length }))
    .toSorted((a, b) => a.depth - b.depth || a.index - b.index)
    .slice(0, MAX_REPO_DEP_FILES)
    .map((entry) => entry.path);
  // The file fetches are independent GETs — issued together. Extraction
  // stays sequential below: the engine serializes it (module-level renovate
  // state) against every other engine task.
  const contents = await Promise.all(taken.map((path) => loadRepoFile({ ...request, path }, opts)));
  const deps: RepoDep[] = [];
  // What each READ file turned into, keyed by path; the files nothing is
  // recorded for are the ones the cap dropped (`not-read` below). Every count
  // a surface prints is derived from this ledger (`lib/discovery-caveats.ts`),
  // never accumulated beside it.
  const read = new Map<string, Pick<RepoDepFile, "outcome" | "extractedBy" | "depCount">>();
  for (const [index, path] of taken.entries()) {
    const content = contents[index] ?? null;
    if (content === null) {
      read.set(path, { outcome: "unreadable", extractedBy: null, depCount: 0 });
      continue;
    }
    const outcome = await engine.extractDeps({ fileName: path, content });
    if (!outcome.ok) {
      read.set(path, {
        outcome: outcome.reason === "no-deps" ? "no-deps" : "error",
        extractedBy: null,
        depCount: 0,
      });
      continue;
    }
    const rows = repoDepsOfFile(outcome.file);
    deps.push(...rows);
    read.set(path, {
      outcome: "extracted",
      extractedBy: outcome.file.manager,
      depCount: rows.length,
    });
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
    truncated: tree.truncated,
    error: null,
  };
}

export function useRepoDeps(loadedRepo: LoadedRepo | null): RepoDeps {
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

  const ensure = useCallback(() => {
    const repo = latestRepo.current;
    if (repo === null) {
      return;
    }
    const key = repoKey(repo);
    if (startedFor.current === key) {
      return;
    }
    startedFor.current = key;
    const token = ++attempt.current;
    setState({ key, view: { ...EMPTY_REPO_DEPS, status: "loading", repo: repo.repo } });
    void discover(repo)
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
  }, [latestRepo]);

  // The repo label rides on the view even before discovery ran — `repo` being
  // set is what enables the tab that TRIGGERS discovery. Memoized so the
  // run-view provider's identity only moves on a load or an async report.
  const repoName = listableRepo?.repo ?? "";
  const currentKey = listableRepo === null ? null : repoKey(listableRepo);
  const view = useMemo(() => {
    const base = state !== null && state.key === currentKey ? state.view : EMPTY_REPO_DEPS;
    return base.repo === repoName ? base : { ...base, repo: repoName };
  }, [state, currentKey, repoName]);

  return { view, ensure };
}
