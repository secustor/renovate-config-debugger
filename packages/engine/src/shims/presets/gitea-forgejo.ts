/**
 * Shared browser transport for the Gitea and Forgejo preset fetchers — they
 * hit the same `/api/v1/repos/:repo/contents/:file` endpoint and return the
 * file as base64-encoded JSON. Mirrors Renovate's gitea/forgejo helpers
 * (getRepoContents), decoding base64 in-browser (no Node Buffer) and reusing
 * Renovate's fetchPreset for the file-candidate / sub-preset logic.
 */
import {
  fetchPreset,
  parsePreset,
  PRESET_DEP_NOT_FOUND,
  PRESET_INVALID,
} from "renovate/dist/config/presets/util.js";
import { ExternalHostError } from "renovate/dist/types/errors/external-host-error.js";
import { getPresetAuth } from "../../auth";
import { encodePathSegments } from "../url-path";
import { getInjectedPreset } from "./injection";

type Source = "gitea" | "forgejo";

interface ContentsResponse {
  type?: string;
  content?: string;
  encoding?: string;
}

/** Decode base64 → UTF-8 string using browser-native primitives. */
function decodeBase64(input: string): string {
  const bin = atob(input.replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function tokenFor(source: Source): string | undefined {
  const auth = getPresetAuth();
  return source === "gitea" ? auth.giteaToken : auth.forgejoToken;
}

function makeFetchJSONFile(source: Source) {
  return async function fetchJSONFile(
    repo: string,
    fileName: string,
    endpoint: string,
    tag?: string,
  ): Promise<Record<string, unknown> | null> {
    const ref = tag ? `?ref=${encodeURIComponent(tag)}` : "";
    // Security 2026-07-25: `repo` is config-supplied — encoded per segment so
    // it cannot reshape the path (`fileName`/`tag` were already encoded).
    const url = `${endpoint}api/v1/repos/${encodePathSegments(repo)}/contents/${encodeURIComponent(fileName)}${ref}`;
    const headers: Record<string, string> = { accept: "application/json" };
    const token = tokenFor(source);
    if (token) {
      headers.authorization = `token ${token}`;
    }
    let res: Response;
    try {
      res = await fetch(url, { headers });
    } catch (err) {
      throw new ExternalHostError(
        new Error(
          `Could not reach the ${source} endpoint ${endpoint} from the browser — ` +
            `likely missing CORS headers or a network block (${err instanceof Error ? err.message : String(err)})`,
        ),
        source,
      );
    }
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      throw new ExternalHostError(
        new Error(
          `${source} API rejected the request (HTTP ${res.status}) — rate limit or missing token`,
        ),
        source,
      );
    }
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

  function getPresetFromEndpoint(
    repo: string,
    filePreset: string,
    presetPath?: string,
    endpoint: string = defaultEndpoint,
    tag?: string,
  ): Promise<Record<string, unknown> | null> {
    return fetchPreset({ repo, filePreset, presetPath, endpoint, tag, fetch: fetchJSONFile });
  }

  function getPreset(config: {
    repo: string;
    presetName?: string;
    presetPath?: string;
    tag?: string;
  }): Promise<Record<string, unknown> | null> {
    const { repo, presetName = "default", presetPath, tag } = config;
    const injected = getInjectedPreset({ presetSource: source, repo, presetPath, presetName, tag });
    if (injected) {
      return Promise.resolve(injected);
    }
    return getPresetFromEndpoint(repo, presetName, presetPath, defaultEndpoint, tag);
  }

  return { Endpoint: defaultEndpoint, fetchJSONFile, getPresetFromEndpoint, getPreset };
}
