/**
 * The platform context this app can resolve `local>` presets against, and
 * which endpoints it TRUSTS (roadmap 010 + Security 2026-07-25).
 *
 * Lives in its own module rather than App.tsx so the pure share-link policy in
 * share.ts can be decided — and unit-tested — against the very same defaults
 * the platform <select> renders, with no React in the way.
 */

/** The platform a fresh session starts on, and the one a share link that names
 *  none is read against. Here rather than re-typed per consumer: the codec's
 *  omit-the-default rule (share.ts) and the stored-settings fallbacks
 *  (use-platform-context, use-share-link) have to agree on it by construction,
 *  or a link round-trips onto a different host than it was made on. */
export const DEFAULT_PLATFORM = "github";

/** {@link DEFAULT_PLATFORM}'s endpoint — the same value, named once. */
export const DEFAULT_ENDPOINT = "https://api.github.com";

/** Platforms that resolve `local>` in the browser, with their default endpoint.
 *  An empty endpoint means "not fetched in the browser" (a real Renovate run
 *  reaches it; this app never does). */
export const PLATFORM_ENDPOINTS: Record<string, string> = {
  github: DEFAULT_ENDPOINT,
  gitlab: "https://gitlab.com/api/v4",
  gitea: "https://gitea.com",
  forgejo: "https://codeberg.org",
  azure: "",
  bitbucket: "",
  "bitbucket-server": "",
  gerrit: "",
  codecommit: "",
  "scm-manager": "",
};

export const PLATFORMS = Object.keys(PLATFORM_ENDPOINTS);

/**
 * Canonical form of an endpoint for comparison: scheme + host(+port) + path
 * without a trailing slash, http(s) only. Derived through `URL` rather than
 * string munging so the classic look-alikes normalize to what actually gets
 * contacted — `https://api.github.com@evil.example/` has host `evil.example`,
 * and `https://api.github.com/#…` cannot smuggle a different host through the
 * fragment. Returns null for anything that is not an http(s) URL.
 */
function normalizeEndpoint(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
}

function buildTrustedEndpoints(): ReadonlySet<string> {
  const trusted = new Set<string>();
  for (const endpoint of Object.values(PLATFORM_ENDPOINTS)) {
    const normalized = endpoint ? normalizeEndpoint(endpoint) : null;
    if (normalized) {
      trusted.add(normalized);
    }
  }
  return trusted;
}

/** The public hosts this app ships with — the ONLY endpoints a share link may
 *  point a run at without the token-suppression policy kicking in. */
const TRUSTED_ENDPOINTS = buildTrustedEndpoints();

/**
 * Security 2026-07-25: is this endpoint one of the shipped public hosts?
 * An empty endpoint is trusted because nothing is fetched at all (the
 * "not fetched in the browser" platforms). Everything else — including a
 * perfectly legitimate self-hosted instance — is untrusted: the app cannot
 * tell the user's own GitHub Enterprise from an attacker's collector, so a
 * LINK never gets the benefit of the doubt (a hand-typed endpoint still does,
 * see App.tsx's `onEndpointChange` / `blockedByLayerErrors`).
 */
export function isTrustedEndpoint(value: string): boolean {
  if (value === "") {
    return true;
  }
  const normalized = normalizeEndpoint(value);
  return normalized !== null && TRUSTED_ENDPOINTS.has(normalized);
}
