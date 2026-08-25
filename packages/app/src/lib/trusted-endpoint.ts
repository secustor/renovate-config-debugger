import { PLATFORM_ENDPOINTS } from "@/data/platform-endpoints";

/**
 * Security 2026-07-25: host-confusion defence for share links.
 *
 * This is a security PREDICATE, not a data table, which is why it lives in
 * `lib/` rather than beside the endpoint list it reads. `data/` is content the
 * app ships; a rule that decides whether a link may point a run — carrying the
 * user's tokens — at an arbitrary host is behaviour, and it belongs next to the
 * app's other endpoint validator, `isValidEndpoint` in `lib/input-schemas.ts`,
 * where an auditor reading one will find the other.
 *
 * The tables (`PLATFORM_ENDPOINTS`, `DEFAULT_PLATFORM`, `PLATFORMS`) stayed in
 * `data/`, which is what they are.
 */

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
