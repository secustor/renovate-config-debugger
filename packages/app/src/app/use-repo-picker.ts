/**
 * Roadmap 085 — the signed-in half of the repo-load overlay: the user's own
 * GitHub repositories as pickable rows under the reference field, each probed
 * (lazily, only the visible few) for the config file a load would find.
 *
 * The picker is a shortcut, not a second load path: picking a row only WRITES
 * the reference field (as `github.com/owner/repo`, so the load pins the GitHub
 * context whatever platform is selected) and the one Load button remains the
 * only trigger. Everything the load does — validation, endpoint choice, the
 * inherited-config probe — stays in `use-repo-load`, untouched.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { listUserRepos, probeConfigFile, repoNote, type UserRepo } from "@/platform/github-repos";
import { useSyncedReset } from "@/hooks/use-synced-reset";
import type { RepoPickerView } from "@/types/repo";

/** Rows shown (and probed) at once — the picker surfaces recent work, and
 *  every probe behind it is a real API request. Type to narrow. */
const VISIBLE_ROWS = 8;

export interface RepoPickerHost {
  /** The overlay's open state — nothing is fetched while it is closed. */
  open: boolean;
  /** GitHub OAuth session state — the picker exists only signed in. */
  signedIn: boolean;
  /** The reference field's live value, doubling as the filter. */
  query: string;
  /** Receives the picked reference (`github.com/owner/repo`). */
  onPick: (reference: string) => void;
}

/** The reference a picked row writes: host-qualified, so the load pins the
 *  GitHub context instead of inheriting whatever platform is selected. */
export function pickerReference(name: string): string {
  return `github.com/${name}`;
}

/** Case-insensitive substring filter. A query that IS a picked reference
 *  (`github.com/owner/repo`) keeps matching its row, so picking never makes
 *  the row it picked disappear. */
export function filterUserRepos(repos: UserRepo[], query: string): UserRepo[] {
  const q = query
    .trim()
    .toLowerCase()
    .replace(/^(?:https?:\/\/)?github\.com\//, "");
  if (!q) {
    return repos;
  }
  return repos.filter((r) => r.name.toLowerCase().includes(q));
}

export function useRepoPicker(host: RepoPickerHost): RepoPickerView | null {
  const { open, signedIn, query, onPick } = host;
  const [repos, setRepos] = useState<UserRepo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [badges, setBadges] = useState<ReadonlyMap<string, string | null>>(new Map());
  // Probes in flight — a ref, because launching one must not re-render and a
  // settled probe reports through `badges`.
  const probing = useRef(new Set<string>());

  // A sign-out invalidates the list (it was THAT account's); drop it so a later
  // session starts fresh instead of showing someone else's repos. During render
  // — React's "adjust state when a prop changes" idiom: the flag is the trigger
  // and the drop reads nothing else, and the previous account's rows are gone
  // before the paint rather than one committed frame after it. The fetch below
  // cannot race in between: it is gated on `signedIn` too.
  useSyncedReset(signedIn, () => {
    if (!signedIn) {
      setRepos(null);
      setFailed(false);
      setBadges(new Map());
    }
  });
  // The in-flight set is a ref, so its half of the same invalidation stays an
  // effect: a ref write during render is one React is free to replay. It has to
  // happen — a name left in here after the badges were dropped would never be
  // re-probed — and it runs before the probe effect below, which is declared
  // after it.
  useEffect(() => {
    if (!signedIn) {
      probing.current.clear();
    }
  }, [signedIn]);

  const wanted = open && signedIn;
  useEffect(() => {
    if (!wanted || repos !== null || failed) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await listUserRepos();
        if (!cancelled) {
          setRepos(list);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wanted, repos, failed]);

  const filtered = useMemo(() => filterUserRepos(repos ?? [], query), [repos, query]);
  const visible = useMemo(() => filtered.slice(0, VISIBLE_ROWS), [filtered]);

  useEffect(() => {
    if (!wanted) {
      return;
    }
    for (const repo of visible) {
      if (badges.has(repo.name) || probing.current.has(repo.name)) {
        continue;
      }
      probing.current.add(repo.name);
      void (async () => {
        try {
          const file = await probeConfigFile(repo);
          setBadges((prev) => new Map(prev).set(repo.name, file));
        } catch {
          // A probe that could not answer — the request failed, or the row's
          // name is not addressable at all — stays unknown (no badge) and is
          // retryable, which a null (a confident "no config") would not be.
          probing.current.delete(repo.name);
        }
      })();
    }
  }, [wanted, visible, badges]);

  if (!signedIn) {
    return null;
  }
  const selectedQuery = query.trim().toLowerCase();
  return {
    status: failed ? "error" : repos === null ? "loading" : "ready",
    rows: visible.map((r) => ({
      name: r.name,
      note: repoNote(r),
      configFile: badges.get(r.name),
      selected:
        selectedQuery === r.name.toLowerCase() ||
        selectedQuery === pickerReference(r.name).toLowerCase(),
    })),
    hiddenMatches: Math.max(0, filtered.length - VISIBLE_ROWS),
    onPick: (name) => onPick(pickerReference(name)),
  };
}
