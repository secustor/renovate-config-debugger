/**
 * The app's half of a VERBATIM cross-package string contract.
 *
 * `packages/engine/src/shims/presets/host-transport.ts` ends its 401/403/429
 * message with the words "rate limit or missing token", and says in its header
 * that the wording is load-bearing: the app matches it to tell an auth or
 * rate-limit failure apart from a genuinely missing preset, and to decide
 * whether offering sign-in would help. Changing either side degrades the app
 * SILENTLY — it simply stops offering the fix, and nothing fails.
 *
 * That contract used to be spelled as a bare regex literal in two places, so
 * the engine's note had to name two files by path and hope. It is one function
 * now, which is the file the engine comment points at.
 */

/**
 * Whether a failure message is the shim's auth / rate-limit flavor, as opposed
 * to a preset that genuinely is not there. Renovate rethrows these WITHOUT the
 * rewrite it applies to `dep not found`, which is why the fetcher's own wording
 * survives all the way to the app.
 */
export function isGithubRateLimited(message: string | undefined): boolean {
  return /rate limit or missing token/i.test(message ?? "");
}
