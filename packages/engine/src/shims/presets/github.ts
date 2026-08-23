/**
 * Browser shim for renovate/dist/config/presets/github/index.js.
 * Reuses Renovate's own fetchPreset/parsePreset logic (file-name candidates,
 * sub-preset lookup, renovate.json fallback) — only the HTTP transport is
 * replaced with browser fetch() against the CORS-enabled GitHub API.
 */
import {
  ExternalHostError,
  fetchPreset,
  parsePreset,
  PRESET_DEP_NOT_FOUND,
} from "../renovate-internals";
import { resolveAuthToken } from "../../auth";
import { encodePathSegments } from "../url-path";
import { getInjectedPreset } from "./injection";

export const Endpoint = "https://api.github.com/";

export async function fetchJSONFile(
  repo: string,
  fileName: string,
  endpoint: string,
  tag?: string,
): Promise<Record<string, unknown> | null> {
  // Security 2026-07-25: `repo`, `fileName` (built from a preset's own
  // `presetPath`/name by upstream's fetchPreset) and `tag` are all
  // config-supplied — percent-encoded before they compose the request. This
  // was the only transport that also interpolated `tag` raw into the query.
  const ref = tag ? `?ref=${encodeURIComponent(tag)}` : "";
  const url = `${endpoint}repos/${encodePathSegments(repo)}/contents/${encodePathSegments(fileName)}${ref}`;
  const headers: Record<string, string> = {
    // raw media type avoids base64 decoding and returns the file as-is
    accept: "application/vnd.github.raw+json",
  };
  const githubToken = resolveAuthToken("github", url);
  if (githubToken) {
    headers.authorization = `Bearer ${githubToken}`;
  }
  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    // fetch() rejects on network failure or a CORS block — the endpoint could
    // not be reached from the browser at all (distinct from a 404 not-found).
    throw new ExternalHostError(
      new Error(
        `Could not reach the GitHub endpoint ${endpoint} from the browser — ` +
          `likely missing CORS headers or a network block (${err instanceof Error ? err.message : String(err)})`,
      ),
      "github",
    );
  }
  if (res.status === 401 || res.status === 403 || res.status === 429) {
    throw new ExternalHostError(
      new Error(
        `GitHub API rejected the request (HTTP ${res.status}) — rate limit or missing token`,
      ),
      "github",
    );
  }
  if (!res.ok) {
    throw new Error(PRESET_DEP_NOT_FOUND);
  }
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
  const injected = getInjectedPreset({ presetSource: "github", repo, presetPath, presetName, tag });
  if (injected) {
    return Promise.resolve(injected);
  }
  return getPresetFromEndpoint(repo, presetName, presetPath, Endpoint, tag);
}
