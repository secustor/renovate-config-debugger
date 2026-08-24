/**
 * Shared preset resolver for Gitea and Forgejo — they hit the same
 * `/api/v1/repos/:repo/contents/:file` endpoint and return the file as
 * base64-encoded JSON. Mirrors Renovate's gitea/forgejo helpers
 * (getRepoContents) over ./host-transport.ts, reusing Renovate's fetchPreset
 * for the file-candidate / sub-preset logic.
 */
import { parsePreset, PRESET_DEP_NOT_FOUND, PRESET_INVALID } from "../renovate-internals";
import { encodePathSegments } from "../url-path";
import {
  authHeadersFor,
  decodeBase64,
  giteaContentUrl,
  hostFetch,
  makeEndpointResolver,
  makeInjectableGetPreset,
} from "./host-transport";

type Source = "gitea" | "forgejo";

interface ContentsResponse {
  type?: string;
  content?: string;
  encoding?: string;
}

function makeFetchJSONFile(source: Source) {
  return async function fetchJSONFile(
    repo: string,
    fileName: string,
    endpoint: string,
    tag?: string,
  ): Promise<Record<string, unknown> | null> {
    // Security 2026-07-25: `fileName` is config-supplied — encoded per segment
    // (refusing `.`/`..`) so it cannot reshape the path, same as the github
    // transport (`tag` lands in the query, plain encoding suffices).
    const url = giteaContentUrl(endpoint, repo, encodePathSegments(fileName), tag);
    const res = await hostFetch({
      platform: source,
      url,
      label: source,
      shownEndpoint: endpoint,
      headers: authHeadersFor(source, url),
    });
    if (!res.ok) {
      throw new Error(PRESET_DEP_NOT_FOUND);
    }
    const body = (await res.json()) as ContentsResponse;
    // Forgejo's resolver rejects anything that is not a plain file.
    if (source === "forgejo" && body.type && body.type !== "file") {
      throw new Error(PRESET_INVALID);
    }
    const contentString = body.content ? decodeBase64(body.content) : "";
    return parsePreset(contentString, fileName);
  };
}

export function makeGiteaLikeResolver(source: Source, defaultEndpoint: string) {
  const fetchJSONFile = makeFetchJSONFile(source);
  const getPresetFromEndpoint = makeEndpointResolver(defaultEndpoint, fetchJSONFile);
  const getPreset = makeInjectableGetPreset(source, (repo, presetName, presetPath, tag) =>
    getPresetFromEndpoint(repo, presetName, presetPath, defaultEndpoint, tag),
  );
  return { Endpoint: defaultEndpoint, fetchJSONFile, getPresetFromEndpoint, getPreset };
}
