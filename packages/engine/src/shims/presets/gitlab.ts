/**
 * Browser shim for renovate/dist/config/presets/gitlab/index.js.
 * Reuses Renovate's fetchPreset/parsePreset (file-name candidates, sub-preset
 * lookup, renovate.json fallback); only the HTTP transport is replaced with a
 * browser fetch() against the CORS-enabled GitLab REST API v4. Like upstream,
 * a missing tag resolves the project's default branch first.
 */
import {
  ExternalHostError,
  fetchPreset,
  parsePreset,
  PRESET_DEP_NOT_FOUND,
} from "../renovate-internals";
import { resolveAuthToken } from "../../auth";
import { getInjectedPreset } from "./injection";

export const Endpoint = "https://gitlab.com/api/v4/";

/** Roadmap 076: the credential is chosen against the URL the request goes to,
 *  so a self-hosted GitLab covered by a `hostRules` entry gets its own token
 *  and gitlab.com keeps the per-type one. */
function authHeaders(url: string): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  const gitlabToken = resolveAuthToken("gitlab", url);
  if (gitlabToken) {
    headers["PRIVATE-TOKEN"] = gitlabToken;
  }
  return headers;
}

async function gitlabRequest(url: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { headers: authHeaders(url) });
  } catch (err) {
    throw new ExternalHostError(
      new Error(
        `Could not reach the GitLab endpoint ${url} from the browser — ` +
          `likely missing CORS headers or a network block (${err instanceof Error ? err.message : String(err)})`,
      ),
      "gitlab",
    );
  }
  if (res.status === 401 || res.status === 403 || res.status === 429) {
    throw new ExternalHostError(
      new Error(
        `GitLab API rejected the request (HTTP ${res.status}) — rate limit or missing token`,
      ),
      "gitlab",
    );
  }
  if (!res.ok) {
    // not-found (missing preset file) — lets fetchPreset try the next candidate
    throw new Error(PRESET_DEP_NOT_FOUND);
  }
  return res;
}

async function getDefaultBranchName(urlEncodedRepo: string, endpoint: string): Promise<string> {
  const res = await gitlabRequest(`${endpoint}projects/${urlEncodedRepo}`);
  const body = (await res.json()) as { default_branch?: string };
  return body.default_branch ?? "master";
}

export async function fetchJSONFile(
  repo: string,
  fileName: string,
  endpoint: string,
  tag?: string,
): Promise<Record<string, unknown> | null> {
  const urlEncodedRepo = encodeURIComponent(repo);
  const urlEncodedFile = encodeURIComponent(fileName);
  const ref = tag ?? (await getDefaultBranchName(urlEncodedRepo, endpoint));
  const url = `${endpoint}projects/${urlEncodedRepo}/repository/files/${urlEncodedFile}/raw?ref=${encodeURIComponent(ref)}`;
  const res = await gitlabRequest(url);
  return parsePreset(await res.text(), fileName);
}

export function getPresetFromEndpoint(
  repo: string,
  filePreset: string,
  presetPath?: string,
  endpoint: string = Endpoint,
  tag?: string,
): Promise<Record<string, unknown> | null> {
  return fetchPreset({ repo, filePreset, presetPath, endpoint, tag, fetch: fetchJSONFile });
}

export function getPreset(config: {
  repo: string;
  presetName?: string;
  presetPath?: string;
  tag?: string;
}): Promise<Record<string, unknown> | null> {
  const { repo, presetName = "default", presetPath, tag } = config;
  const injected = getInjectedPreset({ presetSource: "gitlab", repo, presetPath, presetName, tag });
  if (injected) {
    return Promise.resolve(injected);
  }
  return getPresetFromEndpoint(repo, presetName, presetPath, Endpoint, tag);
}
