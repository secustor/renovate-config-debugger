/**
 * Browser shim for renovate/dist/config/presets/github/index.js.
 * Reuses Renovate's own fetchPreset/parsePreset logic (file-name candidates,
 * sub-preset lookup, renovate.json fallback) — only the HTTP transport is
 * replaced with browser fetch() against the CORS-enabled GitHub API
 * (./host-transport.ts).
 */
import { parsePreset, PRESET_DEP_NOT_FOUND } from "../renovate-internals";
import { encodePathSegments } from "../url-path";
import {
  authHeadersFor,
  githubContentUrl,
  hostFetch,
  makeEndpointResolver,
  makeInjectableGetPreset,
  PLATFORM_ENDPOINTS,
} from "./host-transport";

export const Endpoint = PLATFORM_ENDPOINTS.github;

export async function fetchJSONFile(
  repo: string,
  fileName: string,
  endpoint: string,
  tag?: string,
): Promise<Record<string, unknown> | null> {
  // Security 2026-07-25: `fileName` (built from a preset's own
  // `presetPath`/name by upstream's fetchPreset) is config-supplied, so it is
  // percent-encoded per segment before it composes the request. This was the
  // only transport that also interpolated `tag` raw into the query.
  const url = githubContentUrl(endpoint, repo, encodePathSegments(fileName), tag);
  const res = await hostFetch({
    platform: "github",
    url,
    label: "GitHub",
    shownEndpoint: endpoint,
    headers: authHeadersFor("github", url),
  });
  if (!res.ok) {
    throw new Error(PRESET_DEP_NOT_FOUND);
  }
  return parsePreset(await res.text(), fileName);
}

export const getPresetFromEndpoint = makeEndpointResolver(Endpoint, fetchJSONFile);

export const getPreset = makeInjectableGetPreset("github", (repo, presetName, presetPath, tag) =>
  getPresetFromEndpoint(repo, presetName, presetPath, Endpoint, tag),
);
