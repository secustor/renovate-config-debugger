/**
 * Roadmap 007 — "Load from repo". Probes a repository's documented Renovate
 * config-file locations (in Renovate's own order) using the same browser
 * fetch() transports as the preset fetchers, and returns the first file that
 * exists as raw text. Kept free of any app concerns: it only knows platforms,
 * repos, endpoints and refs.
 *
 * The TRANSPORT is shared with the preset fetchers (./presets/host-transport):
 * URL shapes, auth headers and the two ExternalHostError shapes are the same
 * facts about the same four hosts. What is deliberately NOT shared is what
 * happens past the response: the preset fetchers wrap Renovate's
 * fetchPreset/parsePreset (file-candidate recursion, JSON parsing, sub-preset
 * lookup), semantics we do NOT want here. We want the file's exact text, one
 * probe per candidate — hence the 404 sentinel below rather than
 * `PRESET_DEP_NOT_FOUND`.
 */
import { ExternalHostError } from "./renovate-internals";
import {
  authHeadersFor,
  decodeBase64,
  giteaContentUrl,
  githubContentUrl,
  gitlabFileUrl,
  gitlabProjectUrl,
  type HostPlatform,
  PLATFORM_ENDPOINTS,
  hostFetch,
} from "./presets/host-transport";
import { encodePathSegments } from "./url-path";

/** The exported name for {@link HostPlatform} — what the barrel and the app
 *  have always called it. */
export type RepoPlatform = HostPlatform;

export interface RepoConfigRequest {
  platform: RepoPlatform;
  repo: string;
  endpoint?: string;
  ref?: string;
}

/** Roadmap 045 — ONE exact file in a repository, no candidate chain. */
export interface RepoFileRequest {
  platform: RepoPlatform;
  repo: string;
  /** Exact path inside `repo` (e.g. `org-inherited-config.json`). */
  path: string;
  endpoint?: string;
  ref?: string;
}

export interface RepoConfigResult {
  /** The winning file's name (e.g. `renovate.json5`, `.github/renovate.json`). */
  fileName: string;
  /** Raw file text; for package.json, the JSON.stringify'd `renovate` value. */
  content: string;
  /** Every candidate probed, in order, up to and including the winner. */
  probed: string[];
}

/** Thrown when every documented location was probed and none held a config. */
export class RepoConfigNotFoundError extends Error {
  readonly probed: string[];
  constructor(repo: string, probed: string[]) {
    super(`No Renovate config found in ${repo} (tried ${probed.length} locations)`);
    this.name = "RepoConfigNotFoundError";
    this.probed = probed;
  }
}

/**
 * Mirrors `configFileNames` in renovate/dist/config/app-strings.js after
 * brace-expansion (`renovate.json{,c,5}` → .json/.jsonc/.json5), in order.
 * detectConfigFile walks this list and the first existing file wins. Hardcoded
 * because upstream exports `getConfigFileNames()`, not the raw `configFileNames`
 * array; keep in sync with the pinned Renovate version.
 */
export const CONFIG_FILE_NAMES = [
  "renovate.json",
  "renovate.jsonc",
  "renovate.json5",
  ".github/renovate.json",
  ".github/renovate.jsonc",
  ".github/renovate.json5",
  ".gitlab/renovate.json",
  ".gitlab/renovate.jsonc",
  ".gitlab/renovate.json5",
  ".renovaterc",
  ".renovaterc.json",
  ".renovaterc.jsonc",
  ".renovaterc.json5",
  "package.json",
];

/** A 404-equivalent: this candidate is absent, move on to the next one. */
const NOT_FOUND = Symbol("repo-config-not-found");

function withTrailingSlash(endpoint: string): string {
  return endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
}

/**
 * One probe request. The shared transport already throws on a CORS/network
 * failure and on 401/403/429; here the platform id is also the label the
 * messages use, which is the wording this module has always produced.
 */
function probe(platform: RepoPlatform, url: string, endpoint: string): Promise<Response> {
  return hostFetch({
    platform,
    url,
    label: platform,
    shownEndpoint: endpoint,
    headers: authHeadersFor(platform, url),
  });
}

async function githubRaw(
  repo: string,
  path: string,
  endpoint: string,
  ref?: string,
): Promise<string | typeof NOT_FOUND> {
  const url = githubContentUrl(endpoint, repo, encodePathSegments(path), ref);
  const res = await probe("github", url, endpoint);
  return res.ok ? res.text() : NOT_FOUND;
}

async function gitlabRaw(
  repo: string,
  path: string,
  endpoint: string,
  ref: string,
): Promise<string | typeof NOT_FOUND> {
  const url = gitlabFileUrl(endpoint, repo, encodeURIComponent(path), ref);
  const res = await probe("gitlab", url, endpoint);
  return res.ok ? res.text() : NOT_FOUND;
}

async function gitlabDefaultBranch(repo: string, endpoint: string): Promise<string> {
  const res = await probe("gitlab", gitlabProjectUrl(endpoint, repo), endpoint);
  if (!res.ok) {
    // A missing project aborts (no point probing 14 files under it).
    throw new ExternalHostError(
      new Error(`GitLab project ${repo} not found (HTTP ${res.status})`),
      "gitlab",
    );
  }
  const body = (await res.json()) as { default_branch?: string };
  return body.default_branch ?? "master";
}

async function giteaLikeRaw(
  platform: "gitea" | "forgejo",
  repo: string,
  path: string,
  endpoint: string,
  ref?: string,
): Promise<string | typeof NOT_FOUND> {
  // Encoded whole rather than per segment — the divergence from the preset
  // fetcher's leg is preserved as-is; see host-transport's builder note.
  const url = giteaContentUrl(endpoint, repo, encodeURIComponent(path), ref);
  const res = await probe(platform, url, endpoint);
  if (!res.ok) {
    return NOT_FOUND;
  }
  const body = (await res.json()) as { type?: string; content?: string };
  if (body.type && body.type !== "file") {
    return NOT_FOUND;
  }
  return body.content ? decodeBase64(body.content) : "";
}

/**
 * One exact file through the platform's own content transport. `gitlabRef` must
 * already be resolved (GitLab's raw endpoint requires an explicit ref) — the
 * probe loop below resolves it once for all 14 candidates, and
 * {@link fetchRepoFile} resolves it for its single fetch.
 */
function fetchRawFile(
  platform: RepoPlatform,
  repo: string,
  path: string,
  endpoint: string,
  ref: string | undefined,
  gitlabRef: string,
): Promise<string | typeof NOT_FOUND> {
  if (platform === "github") {
    return githubRaw(repo, path, endpoint, ref);
  }
  if (platform === "gitlab") {
    return gitlabRaw(repo, path, endpoint, gitlabRef);
  }
  return giteaLikeRaw(platform, repo, path, endpoint, ref);
}

/**
 * Probes the documented config-file locations in order and returns the first
 * that exists as raw text. A 404-equivalent moves to the next candidate; any
 * ExternalHostError (CORS / auth / rate limit) aborts immediately — probing 14
 * files against a blocked host is pointless. Throws RepoConfigNotFoundError
 * once every candidate has been exhausted.
 */
export async function fetchRepoConfig(req: RepoConfigRequest): Promise<RepoConfigResult> {
  const { platform, repo } = req;
  const endpoint = withTrailingSlash(req.endpoint || PLATFORM_ENDPOINTS[platform]);
  // GitLab's raw endpoint requires an explicit ref; resolve the default branch
  // once up front rather than per probe.
  const gitlabRef =
    platform === "gitlab" ? (req.ref ?? (await gitlabDefaultBranch(repo, endpoint))) : "";

  const probed: string[] = [];
  for (const fileName of CONFIG_FILE_NAMES) {
    probed.push(fileName);
    const raw = await fetchRawFile(platform, repo, fileName, endpoint, req.ref, gitlabRef);
    if (raw === NOT_FOUND) {
      continue;
    }
    if (fileName === "package.json") {
      const extracted = extractPackageJsonConfig(raw);
      if (extracted === null) {
        continue; // no `renovate` key or unparseable — treat as exhausted
      }
      return { fileName, content: extracted, probed };
    }
    // Empty config file is `{}` upstream.
    return { fileName, content: raw.trim() === "" ? "{}" : raw, probed };
  }

  throw new RepoConfigNotFoundError(repo, probed);
}

/**
 * Roadmap 045 — fetches ONE named file from a repository as raw text, or null
 * when it is absent (a 404-equivalent). No candidate chain and no parsing: the
 * inherited-config probe knows exactly which file a real run would read
 * (`inheritConfigFileName` in `inheritConfigRepoName`), so anything else would
 * be inventing behavior Renovate does not have. Transport-level failures (CORS,
 * auth, rate limit) still throw ExternalHostError, exactly as the config probe
 * does — "the host refused us" is not "the file does not exist".
 */
export async function fetchRepoFile(req: RepoFileRequest): Promise<string | null> {
  const { platform, repo, path } = req;
  const endpoint = withTrailingSlash(req.endpoint || PLATFORM_ENDPOINTS[platform]);
  const gitlabRef =
    platform === "gitlab" ? (req.ref ?? (await gitlabDefaultBranch(repo, endpoint))) : "";
  const raw = await fetchRawFile(platform, repo, path, endpoint, req.ref, gitlabRef);
  return raw === NOT_FOUND ? null : raw;
}

/** Roadmap 078 — one recursive git-tree listing, for the From-repository
 *  dependency picker. GitHub only, deliberately: the tree API shape is
 *  GitHub's, and the picker feature is scoped to the host the app can sign
 *  into — other platforms keep the paste-a-reference path. */
export interface RepoTreeRequest {
  platform: RepoPlatform;
  repo: string;
  endpoint?: string;
  ref?: string;
}

export interface RepoTreeResult {
  /** Every blob path in the tree, in API order. */
  paths: string[];
  /** GitHub truncates very large trees; the listing is honest about it. */
  truncated: boolean;
}

export async function fetchRepoTree(req: RepoTreeRequest): Promise<RepoTreeResult> {
  if (req.platform !== "github") {
    throw new Error("repository file listing is only implemented for GitHub");
  }
  const endpoint = withTrailingSlash(req.endpoint || PLATFORM_ENDPOINTS.github);
  const url = `${endpoint}repos/${encodePathSegments(req.repo)}/git/trees/${encodeURIComponent(
    req.ref || "HEAD",
  )}?recursive=1`;
  const res = await probe("github", url, endpoint);
  if (!res.ok) {
    throw new ExternalHostError(
      new Error(`GitHub tree listing for ${req.repo} failed (HTTP ${res.status})`),
      "github",
    );
  }
  const body = (await res.json()) as { tree?: unknown; truncated?: boolean };
  const paths: string[] = [];
  if (Array.isArray(body.tree)) {
    for (const entry of body.tree as unknown[]) {
      const e = entry as Record<string, unknown>;
      if (e.type === "blob" && typeof e.path === "string") {
        paths.push(e.path);
      }
    }
  }
  return { paths, truncated: body.truncated === true };
}

/**
 * Extracts the `renovate` key from a package.json body. An object value is
 * returned pretty-printed; a string value becomes `{ "extends": [value] }`
 * (Renovate's shorthand). Returns null on parse error or a missing key so the
 * probe loop continues.
 *
 * Exported (roadmap 085 follow-up) for the same reason `CONFIG_FILE_NAMES` is:
 * the app has two surfaces that decide "does this package.json carry a config"
 * — the repo picker's badge and a pasted `…/blob/main/package.json` reference —
 * and both have to answer it the way the DISCOVERY probe here answers it. The
 * app used to keep a copy; this is the one the pinned-Renovate CI covers.
 */
export function extractPackageJsonConfig(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const value = (parsed as Record<string, unknown>).renovate;
  if (value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return JSON.stringify({ extends: [value] }, null, 2);
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value, null, 2);
  }
  return null;
}
