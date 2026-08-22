/**
 * Roadmap 085 — the signed-in repo picker's data: the user's own GitHub
 * repositories, and a cheap "does it carry a Renovate config, and which file"
 * probe for the rows the picker shows.
 *
 * github.com only, deliberately: the one sign-in the app has IS GitHub OAuth
 * (009), so this module never takes an endpoint — it talks to api.github.com
 * with the OAuth token or not at all. Loading any other host stays what it
 * was: paste a reference.
 *
 * The probe reads git TREES, not the 14-candidate contents walk the real load
 * performs (`fetchRepoConfig`) — one request per repo (plus one for `.github/`
 * or `.gitlab/` when present, plus the package.json body when nothing else
 * matched) instead of up to fourteen. The candidate ORDER is the engine's own
 * `CONFIG_FILE_NAMES`, imported dynamically like every other engine touch, so
 * the badge names the same file the load would find.
 */
import { isValidRepoRefPart } from "@/lib/input-schemas";
import { extractRenovateFromPackageJson } from "@/lib/repo-reference";
import { getValidToken } from "./oauth";

const API_ROOT = "https://api.github.com/";

/** One repository the signed-in user can pick. */
export interface UserRepo {
  /** `owner/repo`. */
  name: string;
  language: string | null;
  pushedAt: string | null;
  defaultBranch: string;
}

async function githubFetch(path: string, accept: string): Promise<Response> {
  const token = await getValidToken();
  if (!token) {
    throw new Error("The GitHub session expired — sign in again.");
  }
  return fetch(`${API_ROOT}${path}`, {
    headers: { accept, authorization: `Bearer ${token}` },
  });
}

async function githubJson(path: string): Promise<unknown> {
  const res = await githubFetch(path, "application/vnd.github+json");
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} for ${path.split("?")[0]}`);
  }
  return res.json();
}

/** Lists the signed-in user's repositories, most recently pushed first.
 *  One page of 100 — the picker is a shortcut over recent work, not a
 *  directory browser; anything older is a paste away. Archived repos are
 *  dropped: Renovate does not run on them. */
export async function listUserRepos(): Promise<UserRepo[]> {
  const payload = await githubJson("user/repos?sort=pushed&per_page=100");
  if (!Array.isArray(payload)) {
    return [];
  }
  const repos: UserRepo[] = [];
  for (const entry of payload as unknown[]) {
    const r = entry as Record<string, unknown>;
    if (typeof r.full_name !== "string" || r.archived === true) {
      continue;
    }
    repos.push({
      name: r.full_name,
      language: typeof r.language === "string" ? r.language : null,
      pushedAt: typeof r.pushed_at === "string" ? r.pushed_at : null,
      defaultBranch: typeof r.default_branch === "string" ? r.default_branch : "HEAD",
    });
  }
  return repos;
}

interface TreeEntry {
  path: string;
  type: string;
  sha: string;
}

async function fetchTree(ref: string, repo: string): Promise<TreeEntry[]> {
  const payload = (await githubJson(
    `repos/${repo}/git/trees/${encodeURIComponent(ref)}`,
  )) as Record<string, unknown>;
  if (!Array.isArray(payload.tree)) {
    return [];
  }
  return (payload.tree as unknown[]).filter((e): e is TreeEntry => {
    const t = e as Record<string, unknown>;
    return typeof t.path === "string" && typeof t.type === "string" && typeof t.sha === "string";
  });
}

/**
 * Names the config file Renovate's discovery would find in `repo`'s default
 * branch, or null when there is none. The `package.json` candidate is only
 * decided by its body (the `renovate` key), exactly as the real probe decides
 * it. Transport failures throw — "the probe failed" must stay distinguishable
 * from "no config found".
 */
export async function probeConfigFile(repo: UserRepo): Promise<string | null> {
  // Roadmap 030's use-time boundary: these two compose request paths.
  if (!isValidRepoRefPart(repo.name) || !isValidRepoRefPart(repo.defaultBranch)) {
    return null;
  }
  const engine = await import("@renovate-config-debugger/engine");
  const top = await fetchTree(repo.defaultBranch, repo.name);
  const topByPath = new Map(top.map((e) => [e.path, e]));
  const subtrees = new Map<string, Set<string>>();
  for (const candidate of engine.CONFIG_FILE_NAMES) {
    const slash = candidate.indexOf("/");
    if (slash > 0) {
      const dir = candidate.slice(0, slash);
      const dirEntry = topByPath.get(dir);
      if (dirEntry?.type !== "tree") {
        continue;
      }
      let names = subtrees.get(dir);
      if (!names) {
        names = new Set((await fetchTree(dirEntry.sha, repo.name)).map((e) => e.path));
        subtrees.set(dir, names);
      }
      if (names.has(candidate.slice(slash + 1))) {
        return candidate;
      }
      continue;
    }
    if (topByPath.get(candidate)?.type !== "blob") {
      continue;
    }
    if (candidate === "package.json") {
      const res = await githubFetch(
        `repos/${repo.name}/contents/package.json`,
        "application/vnd.github.raw+json",
      );
      if (!res.ok) {
        continue;
      }
      if (extractRenovateFromPackageJson(await res.text()) !== null) {
        return candidate;
      }
      continue;
    }
    return candidate;
  }
  return null;
}

const NOTE_AGES: [number, string][] = [
  [365, "y"],
  [30, "mo"],
  [7, "w"],
  [1, "d"],
];

/** `TypeScript · 2d ago` — the row's muted note. Exported for its test. */
export function repoNote(repo: UserRepo, now = Date.now()): string {
  const parts: string[] = [];
  if (repo.language) {
    parts.push(repo.language);
  }
  if (repo.pushedAt) {
    const days = Math.floor((now - Date.parse(repo.pushedAt)) / 86_400_000);
    const scale = NOTE_AGES.find(([span]) => days >= span);
    parts.push(scale ? `updated ${Math.floor(days / scale[0])}${scale[1]} ago` : "updated today");
  }
  return parts.join(" · ");
}
