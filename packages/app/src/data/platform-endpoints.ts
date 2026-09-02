/**
 * The platform context this app can resolve `local>` presets against.
 *
 * The table plus the own-key accessor over it; the trust PREDICATE that reads
 * them is a security rule, not data, and lives in `lib/trusted-endpoint.ts`
 * next to the app's other endpoint validator (structure review, finding 20).
 *
 * Lives in its own module rather than App.tsx so the pure share-link policy in
 * share.ts can be decided — and unit-tested — against the very same defaults
 * the platform <select> renders, with no React in the way.
 */
import { ownValue } from "@renovate-config-debugger/engine/is";

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
 *  reaches it; this app never does). A deliberate subset of the ids the engine
 *  shim classifies (`local` excluded — it can never serve a preset); nothing
 *  asserts the two agree, so a Renovate bump that adds a platform (caught by
 *  `engine/test/local-preset-platforms.node.test.ts`) needs an entry here too. */
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

/** The default endpoint for a platform NAME that may be any string — the twin
 *  of the engine's `defaultEndpointFor` (shims/presets/host-transport.ts). The
 *  own-key guard is what keeps a share link naming `constructor` from
 *  resolving to `Object.prototype`'s member instead of an endpoint. */
export function defaultEndpointFor(platform: string): string | undefined {
  return ownValue(PLATFORM_ENDPOINTS, platform);
}
