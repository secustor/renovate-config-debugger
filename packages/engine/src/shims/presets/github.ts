/**
 * Browser shim for renovate/dist/config/presets/github/index.js.
 * Reuses Renovate's own fetchPreset/parsePreset logic (file-name candidates,
 * sub-preset lookup, renovate.json fallback) — only the HTTP transport is
 * replaced with browser fetch() against the CORS-enabled GitHub API.
 */
import {
  fetchPreset,
  parsePreset,
  PRESET_DEP_NOT_FOUND,
} from "renovate/dist/config/presets/util.js";
import { ExternalHostError } from "renovate/dist/types/errors/external-host-error.js";
import { getPresetAuth } from "../../auth";

export const Endpoint = "https://api.github.com/";

export async function fetchJSONFile(
  repo: string,
  fileName: string,
  endpoint: string,
  tag?: string,
): Promise<Record<string, unknown> | null> {
  const ref = tag ? `?ref=${tag}` : "";
  const url = `${endpoint}repos/${repo}/contents/${fileName}${ref}`;
  const headers: Record<string, string> = {
    // raw media type avoids base64 decoding and returns the file as-is
    accept: "application/vnd.github.raw+json",
  };
  const { githubToken } = getPresetAuth();
  if (githubToken) {
    headers.authorization = `Bearer ${githubToken}`;
  }
  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    // network failure or CORS rejection
    throw new ExternalHostError(err instanceof Error ? err : new Error(String(err)), "github");
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
  return getPresetFromEndpoint(repo, presetName, presetPath, Endpoint, tag);
}
