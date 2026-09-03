/**
 * Message fragments the engine PRODUCES and the app READS programmatically.
 *
 * The app cannot see the engine's error types — Renovate rethrows a plain
 * `Error` through its own preset machinery — so the only thing that survives
 * the trip is the message string. That makes the wording an API, and it used to
 * be an API maintained by comment: `shims/presets/host-transport.ts` carried a
 * "VERBATIM STRINGS" banner warning that changing a phrase would degrade the
 * app SILENTLY, because the app simply stops recognising the failure and
 * nothing throws.
 *
 * A banner is not a mechanism. The phrase is declared here instead, once, and
 * both sides import it: the shim builds its message with it, the app builds its
 * matcher from it. There is no second copy to drift from.
 *
 * WHY THIS MODULE HAS NO IMPORTS — `test/import-free-subpaths.node.test.ts`
 * holds it to that, the same way this file replaces the banner it describes
 * above. It is reachable from the app through the `./contracts` subpath, and
 * the app must never pull the Renovate graph onto a static import path (see
 * `lib/rule-verdict.ts` and the engine-root ban in `.oxlintrc.json`).
 * Constants only, so the subpath's whole runtime cost is this file.
 *
 * Not a separate workspace package, deliberately: the app already depends on
 * the engine, and the contract flows the same way the dependency does —
 * producer above, consumer below. A third package would add a version to keep
 * in step for no additional safety.
 */

/**
 * The tail of the message a host API returns for 401 / 403 / 429.
 *
 * The app tells this apart from a genuinely missing preset in order to offer
 * sign-in, which is the whole point: a private repo the user COULD reach and a
 * preset that does not exist look identical otherwise. Read by
 * `isGithubRateLimited` (`packages/app/src/lib/github-failure.ts`).
 */
export const AUTH_OR_RATE_LIMIT_HINT = "rate limit or missing token";

/**
 * The tail of the message a fetch that never reached the host produces.
 *
 * NOT machine-read: the app pastes the engine's whole detail into its own
 * sentence and appends its CORS advice unconditionally, so no matcher depends
 * on this wording. It is declared here anyway because the two producers below
 * spelled it out separately, and because the header it replaces claimed it was
 * a contract — leaving it as prose would keep that claim alive without the
 * check.
 */
export const NETWORK_OR_CORS_HINT = "likely missing CORS headers or a network block";
