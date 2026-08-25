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
 * writes state during render.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  EMPTY_REPO_DEPS,
  type LoadedRepo,
  type RepoDep,
  type RepoDepsView,
  repoDepsOfFile,
} from "@/features/simulator/repo-deps";
import { useLatestRef } from "@/hooks/use-latest-ref";
import { loadEngine } from "@/platform/engine-chunk";
import { loadRepoFile, loadRepoTree } from "@/platform/run";

/** Fetch cap: each package file is one request. The commonest repos fit; the
 *  view counts what the cap dropped rather than pretending it covered all. */
const MAX_REPO_DEP_FILES = 10;

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
  const candidates: string[] = [];
  for (const path of tree.paths) {
    if (IGNORED_PATH.test(path)) {
      continue;
    }
    const managers = engine.matchManagersForFile(path, {
      among: engine.EXTRACTABLE_MANAGERS,
    });
    if (managers.length > 0) {
      candidates.push(path);
    }
  }
  const taken = candidates.slice(0, MAX_REPO_DEP_FILES);
  let skippedFiles = candidates.length - taken.length;
  const deps: RepoDep[] = [];
  let fileCount = 0;
  for (const path of taken) {
    const content = await loadRepoFile({ ...request, path }, opts);
    if (content === null) {
      skippedFiles += 1;
      continue;
    }
    const outcome = await engine.extractDeps({ fileName: path, content });
    if (!outcome.ok) {
      // "no deps in this file" is not a skipped file; a real failure is.
      if (outcome.reason !== "no-deps") {
        skippedFiles += 1;
      }
      continue;
    }
    fileCount += 1;
    deps.push(...repoDepsOfFile(outcome.file));
  }
  return {
    status: "ready",
    repo: repo.repo,
    deps,
    fileCount,
    skippedFiles,
    truncated: tree.truncated,
    error: null,
  };
}

export function useRepoDeps(loadedRepo: LoadedRepo | null): RepoDeps {
  // The report is keyed by the repo it describes: a NEW load doesn't reset
  // anything — a stale report just stops being the displayed view below.
  const [state, setState] = useState<{ key: string; view: RepoDepsView } | null>(null);
  const startedFor = useRef<string | null>(null);
  const latestRepo = useLatestRef(loadedRepo);

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
    setState({ key, view: { ...EMPTY_REPO_DEPS, status: "loading", repo: repo.repo } });
    void discover(repo)
      .then((view) => setState({ key, view }))
      .catch((err: unknown) => {
        // Allow a retry — the failure may be transient (rate limit, network).
        if (startedFor.current === key) {
          startedFor.current = null;
        }
        setState({
          key,
          view: {
            ...EMPTY_REPO_DEPS,
            status: "error",
            repo: repo.repo,
            error: err instanceof Error ? err.message : String(err),
          },
        });
      });
  }, [latestRepo]);

  // The repo label rides on the view even before discovery ran — `repo` being
  // set is what enables the tab that TRIGGERS discovery. Memoized so the
  // run-view provider's identity only moves on a load or an async report.
  const repoName = loadedRepo?.repo ?? "";
  const currentKey = loadedRepo === null ? null : repoKey(loadedRepo);
  const view = useMemo(() => {
    const base = state !== null && state.key === currentKey ? state.view : EMPTY_REPO_DEPS;
    return base.repo === repoName ? base : { ...base, repo: repoName };
  }, [state, currentKey, repoName]);

  return { view, ensure };
}
