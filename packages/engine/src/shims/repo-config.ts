/**
 * Roadmap 007 — "Load from repo". Probes a repository's documented Renovate
 * config-file locations (in Renovate's own order) using the same browser
 * fetch() transports as the preset fetchers, and returns the first file that
 * exists as raw text. Kept free of any app concerns: it only knows platforms,
 * repos, endpoints and refs.
 *
 * The raw-file transports here intentionally mirror — rather than reuse — the
 * preset fetchers in ./presets/*: those wrap Renovate's fetchPreset/parsePreset
 * (file-candidate recursion, JSON parsing, sub-preset lookup), semantics we do
 * NOT want here. We want the file's exact text, one probe per candidate, so the
 * few transport lines (URL shape, auth header, error mapping) are duplicated.
 */
import { ExternalHostError } from "renovate/dist/types/errors/external-host-error.js";
import { getPresetAuth } from "../auth";
import { encodePathSegments } from "./url-path";

export type RepoPlatform = "github" | "gitlab" | "gitea" | "forgejo";

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
const CONFIG_FILE_NAMES = [
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

/** Default (CORS-enabled) API roots, matching the preset fetchers' Endpoints. */
const DEFAULT_ENDPOINTS: Record<RepoPlatform, string> = {
  github: "https://api.github.com/",
  gitlab: "https://gitlab.com/api/v4/",
  gitea: "https://gitea.com/",
  forgejo: "https://codeberg.org/",
};

/** A 404-equivalent: this candidate is absent, move on to the next one. */
const NOT_FOUND = Symbol("repo-config-not-found");

function withTrailingSlash(endpoint: string): string {
  return endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
}

/** Base64 → UTF-8 using browser-native primitives (Gitea/Forgejo contents API). */
function decodeBase64(input: string): string {
  const bin = atob(input.replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Maps a non-ok response to either NOT_FOUND (404) or an ExternalHostError. */
function classifyBadResponse(platform: RepoPlatform, status: number): typeof NOT_FOUND {
  if (status === 401 || status === 403 || status === 429) {
    throw new ExternalHostError(
      new Error(
        `${platform} API rejected the request (HTTP ${status}) — rate limit or missing token`,
      ),
      platform,
    );
  }
  return NOT_FOUND;
}

function unreachable(platform: RepoPlatform, endpoint: string, err: unknown): never {
  throw new ExternalHostError(
    new Error(
      `Could not reach the ${platform} endpoint ${endpoint} from the browser — ` +
        `likely missing CORS headers or a network block (${err instanceof Error ? err.message : String(err)})`,
    ),
    platform,
  );
}

async function githubRaw(
  repo: string,
  path: string,
  endpoint: string,
  ref?: string,
): Promise<string | typeof NOT_FOUND> {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const url = `${endpoint}repos/${encodePathSegments(repo)}/contents/${encodePathSegments(path)}${query}`;
  const headers: Record<string, string> = { accept: "application/vnd.github.raw+json" };
  const { githubToken } = getPresetAuth();
  if (githubToken) {
    headers.authorization = `Bearer ${githubToken}`;
  }
  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    unreachable("github", endpoint, err);
  }
  if (!res.ok) {
    return classifyBadResponse("github", res.status);
  }
  return res.text();
}

async function gitlabRaw(
  repo: string,
  path: string,
  endpoint: string,
  ref: string,
): Promise<string | typeof NOT_FOUND> {
  const url = `${endpoint}projects/${encodeURIComponent(repo)}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(ref)}`;
  const headers: Record<string, string> = { accept: "application/json" };
  const { gitlabToken } = getPresetAuth();
  if (gitlabToken) {
    headers["PRIVATE-TOKEN"] = gitlabToken;
  }
  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    unreachable("gitlab", endpoint, err);
  }
  if (!res.ok) {
    return classifyBadResponse("gitlab", res.status);
  }
  return res.text();
}

async function gitlabDefaultBranch(repo: string, endpoint: string): Promise<string> {
  const headers: Record<string, string> = { accept: "application/json" };
  const { gitlabToken } = getPresetAuth();
  if (gitlabToken) {
    headers["PRIVATE-TOKEN"] = gitlabToken;
  }
  let res: Response;
  try {
    res = await fetch(`${endpoint}projects/${encodeURIComponent(repo)}`, { headers });
  } catch (err) {
    unreachable("gitlab", endpoint, err);
  }
  if (!res.ok) {
    // A missing project aborts (no point probing 14 files under it).
    classifyBadResponse("gitlab", res.status);
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
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const url = `${endpoint}api/v1/repos/${encodePathSegments(repo)}/contents/${encodeURIComponent(path)}${query}`;
  const headers: Record<string, string> = { accept: "application/json" };
  const auth = getPresetAuth();
  const token = platform === "gitea" ? auth.giteaToken : auth.forgejoToken;
  if (token) {
    headers.authorization = `token ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    unreachable(platform, endpoint, err);
  }
  if (!res.ok) {
    return classifyBadResponse(platform, res.status);
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
  const endpoint = withTrailingSlash(req.endpoint || DEFAULT_ENDPOINTS[platform]);
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
  const endpoint = withTrailingSlash(req.endpoint || DEFAULT_ENDPOINTS[platform]);
  const gitlabRef =
    platform === "gitlab" ? (req.ref ?? (await gitlabDefaultBranch(repo, endpoint))) : "";
  const raw = await fetchRawFile(platform, repo, path, endpoint, req.ref, gitlabRef);
  return raw === NOT_FOUND ? null : raw;
}

/**
 * Extracts the `renovate` key from a package.json body. An object value is
 * returned pretty-printed; a string value becomes `{ "extends": [value] }`
 * (Renovate's shorthand). Returns null on parse error or a missing key so the
 * probe loop continues.
 */
function extractPackageJsonConfig(raw: string): string | null {
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
