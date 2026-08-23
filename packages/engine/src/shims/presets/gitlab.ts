/**
 * Browser shim for renovate/dist/config/presets/gitlab/index.js.
 * Reuses Renovate's fetchPreset/parsePreset (file-name candidates, sub-preset
 * lookup, renovate.json fallback); only the HTTP transport is replaced with a
 * browser fetch() against the CORS-enabled GitLab REST API v4
 * (./host-transport.ts). Like upstream, a missing tag resolves the project's
 * default branch first.
 */
import { parsePreset, PRESET_DEP_NOT_FOUND } from "../renovate-internals";
import {
  authHeadersFor,
  gitlabFileUrl,
  gitlabProjectUrl,
  hostFetch,
  makeEndpointResolver,
  makeInjectableGetPreset,
  PLATFORM_ENDPOINTS,
} from "./host-transport";

export const Endpoint = PLATFORM_ENDPOINTS.gitlab;

/** Unlike the other hosts, the unreachable message here names the full request
 *  URL rather than the endpoint root — kept as it was; the app shows it. */
async function gitlabRequest(url: string): Promise<Response> {
  const res = await hostFetch({
    platform: "gitlab",
    url,
    label: "GitLab",
    shownEndpoint: url,
    headers: authHeadersFor("gitlab", url),
  });
  if (!res.ok) {
    // not-found (missing preset file) — lets fetchPreset try the next candidate
    throw new Error(PRESET_DEP_NOT_FOUND);
  }
  return res;
}

async function getDefaultBranchName(repo: string, endpoint: string): Promise<string> {
  const res = await gitlabRequest(gitlabProjectUrl(endpoint, repo));
  const body = (await res.json()) as { default_branch?: string };
  return body.default_branch ?? "master";
}

export async function fetchJSONFile(
  repo: string,
  fileName: string,
  endpoint: string,
  tag?: string,
): Promise<Record<string, unknown> | null> {
  const ref = tag ?? (await getDefaultBranchName(repo, endpoint));
  const res = await gitlabRequest(gitlabFileUrl(endpoint, repo, encodeURIComponent(fileName), ref));
  return parsePreset(await res.text(), fileName);
}

export const getPresetFromEndpoint = makeEndpointResolver(Endpoint, fetchJSONFile);

export const getPreset = makeInjectableGetPreset("gitlab", (repo, presetName, presetPath, tag) =>
  getPresetFromEndpoint(repo, presetName, presetPath, Endpoint, tag),
);
