/**
 * The one browser transport behind every host-backed preset fetcher and behind
 * the repo-config probe (roadmap 007/045): build the URL, attach the host's
 * auth header, fetch, and turn the two transport failures into the
 * `ExternalHostError` shapes the rest of the stack expects.
 *
 * Why it is shared rather than written per host: the four call sites used to
 * spell out the same six steps, and the messages they produce are CONSUMED —
 * the app matches one of them (`../../contracts`), the trace collector unwraps
 * them, and `repo-config` decides whether to keep probing by their type. Four
 * independent producers behind one consumer is how the wording drifts and the
 * UI silently stops recognising an auth failure.
 *
 * What is deliberately NOT here: everything past the response. The preset
 * fetchers hand a non-ok response to Renovate's own `fetchPreset` candidate
 * chain (`PRESET_DEP_NOT_FOUND`), while the repo-config probe treats it as
 * "this candidate is absent, try the next" — the same status, two different
 * meanings, so each keeps its own tail.
 *
 * The two message tails the app depends on come from `../../contracts` rather
 * than being spelled here. This banner used to say instead that they were
 * "VERBATIM STRINGS … must stay byte-identical", name the app files that read
 * them, and warn that changing one degrades the app silently. All of that was
 * true, and none of it was checkable: a warning in a comment is not a
 * mechanism. Sharing the constant means there is no second copy to keep in
 * step, so the instruction is unnecessary.
 */
import { getAuthRefreshHandler, resolveAuthToken } from "../../auth";
import { AUTH_OR_RATE_LIMIT_HINT, NETWORK_OR_CORS_HINT } from "../../contracts";
import { ExternalHostError, fetchPreset } from "../renovate-internals";
import { encodePathSegments } from "../url-path";
import { getInjectedPreset } from "./injection";

/** The four hosts with a CORS-enabled content API a browser can reach. */
export type HostPlatform = "github" | "gitlab" | "gitea" | "forgejo";

/**
 * Default (CORS-enabled) API roots, one table for the whole engine: each
 * preset fetcher's `Endpoint`, the repo-config probe's fallback, and the
 * pipeline's display default all read it. Upstream's Forgejo default
 * (code.forgejo.org) is deliberately not used — see shims/presets/forgejo.ts.
 */
export const PLATFORM_ENDPOINTS: Record<HostPlatform, string> = {
  github: "https://api.github.com/",
  gitlab: "https://gitlab.com/api/v4/",
  gitea: "https://gitea.com/",
  forgejo: "https://codeberg.org/",
};

/** The default endpoint for a platform NAME that may be any string — a
 *  self-hosted platform Renovate knows and this tool has no fetcher for
 *  simply has none. */
export function defaultEndpointFor(platform: string): string | undefined {
  return Object.hasOwn(PLATFORM_ENDPOINTS, platform)
    ? PLATFORM_ENDPOINTS[platform as HostPlatform]
    : undefined;
}

/**
 * The request headers for one host, including its credential when one applies.
 *
 * Roadmap 076: the token is resolved against the URL the request actually goes
 * to, so a self-hosted instance covered by a `hostRules` entry gets its own
 * token while the public host keeps the per-type one.
 */
export function authHeadersFor(platform: HostPlatform, url: string): Record<string, string> {
  const token = resolveAuthToken(platform, url);
  if (platform === "github") {
    // raw media type avoids base64 decoding and returns the file as-is
    const headers: Record<string, string> = { accept: "application/vnd.github.raw+json" };
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
    return headers;
  }
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) {
    if (platform === "gitlab") {
      headers["PRIVATE-TOKEN"] = token;
    } else {
      headers.authorization = `token ${token}`;
    }
  }
  return headers;
}

export interface HostRequest {
  /** `hostType` on the thrown ExternalHostError, and the credential's key. */
  platform: HostPlatform;
  url: string;
  /**
   * How the host is NAMED in the two error messages. The preset fetchers say
   * "GitHub"/"GitLab" (and "gitea"/"forgejo", which have no capitalised form
   * in this codebase); the repo-config probe says the bare platform id. Kept
   * as an explicit input rather than derived, because those strings ship.
   */
  label: string;
  /**
   * What the unreachable message names as the thing that could not be reached:
   * the endpoint root everywhere except the GitLab preset fetcher, which names
   * the full request URL.
   */
  shownEndpoint: string;
  headers: Record<string, string>;
}

/**
 * Fetch one URL from a host, mapping the two transport failures:
 *
 * - `fetch()` rejecting — a network failure or a CORS block, i.e. the endpoint
 *   could not be reached from the browser at all (distinct from a 404).
 * - 401 / 403 / 429 — the host refused us, which is never "the file is
 *   missing" and must not be swallowed by a candidate chain.
 *
 * A 401 with a token attached gets one recovery attempt first: the host
 * revoked the credential before its recorded expiry (GitHub does this to the
 * old access token whenever a shared OAuth grant is refreshed, e.g. by
 * another tab), so the registered {@link AuthRefreshHandler} is asked to
 * renew it and the request is retried once with re-resolved headers.
 *
 * Every other response is returned as-is for the caller to classify.
 */
export async function hostFetch(request: HostRequest): Promise<Response> {
  let headers = request.headers;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(request.url, { headers });
    } catch (err) {
      throw new ExternalHostError(
        new Error(
          `Could not reach the ${request.label} endpoint ${request.shownEndpoint} from the browser — ` +
            `${NETWORK_OR_CORS_HINT} (${err instanceof Error ? err.message : String(err)})`,
        ),
        request.platform,
      );
    }
    if (res.status === 401 && attempt === 0 && (await refreshRejectedAuth(request, headers))) {
      headers = authHeadersFor(request.platform, request.url);
      continue;
    }
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      throw new ExternalHostError(
        new Error(
          `${request.label} API rejected the request (HTTP ${res.status}) — ${AUTH_OR_RATE_LIMIT_HINT}`,
        ),
        request.platform,
      );
    }
    return res;
  }
}

/** The credential the 401'd attempt actually SENT, parsed back out of its own
 *  headers — never re-resolved from the auth state, which a parallel request's
 *  recovery may already have replaced (the handler would then be told a live
 *  token was rejected and rotate it for nothing). */
function sentToken(headers: Record<string, string>): string | undefined {
  const raw = headers["PRIVATE-TOKEN"] ?? headers.authorization;
  return raw?.replace(/^(?:Bearer|token) /, "");
}

/** True when the handler replaced the rejected credential in the auth state
 *  and the 401'd request should be retried. A missing handler, an anonymous
 *  request, or a handler failure all read as "no retry" — the plain throw. */
async function refreshRejectedAuth(
  request: HostRequest,
  headers: Record<string, string>,
): Promise<boolean> {
  const handler = getAuthRefreshHandler();
  const rejected = sentToken(headers);
  if (!handler || rejected === undefined) {
    return false;
  }
  try {
    return await handler(request.platform, request.url, rejected);
  } catch {
    return false;
  }
}

/** `?ref=…`, or nothing when the caller has no ref to pin. */
function refQuery(ref?: string): string {
  return ref ? `?ref=${encodeURIComponent(ref)}` : "";
}

/**
 * The three content-API URL shapes. `encodedPath` is passed already encoded
 * because the two consumers differ: the preset fetchers encode PER SEGMENT
 * (a preset path keeps its slashes), while the repo-config probe's Gitea leg
 * encodes the whole path as one component. That divergence predates this
 * module and is preserved, not blessed.
 *
 * Security 2026-07-25: `repo` is config-supplied everywhere, so it is
 * percent-encoded per segment (refusing `.`/`..`) before it composes a path,
 * and a ref lands in the query with plain encoding.
 */
export function githubContentUrl(
  endpoint: string,
  repo: string,
  encodedPath: string,
  ref?: string,
): string {
  return `${endpoint}repos/${encodePathSegments(repo)}/contents/${encodedPath}${refQuery(ref)}`;
}

/** GitLab's raw-file endpoint REQUIRES an explicit ref, hence the plain param. */
export function gitlabFileUrl(
  endpoint: string,
  repo: string,
  encodedPath: string,
  ref: string,
): string {
  return `${endpoint}projects/${encodeURIComponent(repo)}/repository/files/${encodedPath}/raw?ref=${encodeURIComponent(ref)}`;
}

/** The project itself — read for its `default_branch`. */
export function gitlabProjectUrl(endpoint: string, repo: string): string {
  return `${endpoint}projects/${encodeURIComponent(repo)}`;
}

export function giteaContentUrl(
  endpoint: string,
  repo: string,
  encodedPath: string,
  ref?: string,
): string {
  return `${endpoint}api/v1/repos/${encodePathSegments(repo)}/contents/${encodedPath}${refQuery(ref)}`;
}

/** Decode base64 → UTF-8 with browser-native primitives (no Node Buffer) —
 *  what the Gitea/Forgejo contents API wraps a file in. */
export function decodeBase64(input: string): string {
  const bin = atob(input.replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** The `fetch` callback Renovate's `fetchPreset` drives its candidate chain with. */
type FetchJSONFile = (
  repo: string,
  fileName: string,
  endpoint: string,
  tag?: string,
) => Promise<Record<string, unknown> | null>;

/**
 * A host shim's `getPresetFromEndpoint`: Renovate's own `fetchPreset` (file
 * candidates, sub-preset lookup, renovate.json fallback) over the browser
 * transport, defaulting to the host's own endpoint.
 */
export function makeEndpointResolver(defaultEndpoint: string, fetchJSONFile: FetchJSONFile) {
  return function getPresetFromEndpoint(
    repo: string,
    filePreset: string,
    presetPath?: string,
    endpoint: string = defaultEndpoint,
    tag?: string,
  ): Promise<Record<string, unknown> | null> {
    return fetchPreset({ repo, filePreset, presetPath, endpoint, tag, fetch: fetchJSONFile });
  };
}

/** The config object Renovate's preset resolver hands a shim's `getPreset`. */
export interface GetPresetConfig {
  repo: string;
  presetName?: string;
  presetPath?: string;
  tag?: string;
}

/**
 * A host shim's `getPreset`: consult the manual-injection registry (roadmap
 * 010) first — the universal fallback for presets no browser fetcher can
 * reach — and only then go to the host. Every fetcher does this, which is what
 * makes "provide the content yourself" work uniformly.
 */
export function makeInjectableGetPreset(
  presetSource: string,
  resolve: (
    repo: string,
    presetName: string,
    presetPath: string | undefined,
    tag: string | undefined,
  ) => Promise<Record<string, unknown> | null>,
): (config: GetPresetConfig) => Promise<Record<string, unknown> | null> {
  return (config) => {
    const { repo, presetName = "default", presetPath, tag } = config;
    const injected = getInjectedPreset({ presetSource, repo, presetPath, presetName, tag });
    if (injected) {
      return Promise.resolve(injected);
    }
    return resolve(repo, presetName, presetPath, tag);
  };
}
