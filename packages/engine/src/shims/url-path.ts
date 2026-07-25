/**
 * Security 2026-07-25 — percent-encoding for values interpolated into a
 * request URL PATH.
 *
 * Repo paths, preset paths and file names reaching the browser transports are
 * user input: they come from a config's `extends` entry (`github>owner/repo//
 * some/path:preset`) or from the "Load from repo" field. The GitLab
 * transports always `encodeURIComponent`d their (single-segment) project id;
 * the GitHub and Gitea/Forgejo ones interpolated raw, so a `?`, `#` or `..`
 * could bolt on a query string or climb out of the intended path.
 */

/**
 * A traversal segment cannot be neutralized by encoding at all: `.`/`..` are
 * unreserved, so `encodeURIComponent` leaves them untouched, AND the WHATWG
 * URL parser inside `fetch` treats `%2e`/`%2E` as a dot segment too — verified
 * in test/repo-config.test.ts (`…/repos/org/%2E%2E/%2E%2E/admin` still
 * collapses to `…/admin`). It cannot reach a different HOST, but it can aim a
 * credentialed request at an unintended path on the configured one, so such a
 * path is refused outright. Unreachable for well-formed input: repo slugs and
 * preset paths never contain a bare dot segment (the app's
 * `isValidRepoRefPart` rejects them before a load, and a preset carrying one
 * surfaces this as a contained preset error).
 */
function encodeSegment(segment: string): string {
  if (segment === "." || segment === "..") {
    throw new Error(`Refusing to fetch: "${segment}" is not a valid path segment (traversal)`);
  }
  return encodeURIComponent(segment);
}

/**
 * Encodes each `/`-separated segment, preserving the separators — a nested
 * path (`org/sub/repo`, `.github/renovate.json`) keeps working, and for a
 * well-formed slug the output is byte-for-byte the input.
 */
export function encodePathSegments(path: string): string {
  return path.split("/").map(encodeSegment).join("/");
}
