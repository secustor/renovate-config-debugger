# 009 — "Sign in with GitHub" instead of pasting a token

Milestone: M4 · Status: done 2026-07-23

> Implemented as specified. A new workspace package `packages/oauth-worker` is a
> stateless Cloudflare Worker token-exchange proxy (pure `handleRequest(req,
env)` + a thin default export; unit-tested with `fetch` stubbed, no wrangler
> needed): CORS locked to an `ALLOWED_ORIGINS` allow-list (reflects the matched
> origin, never `*`; other origins get 403 before GitHub is touched), `POST
/exchange` and `POST /refresh` append the `client_secret` (Worker secret) and
> pass GitHub's token JSON back verbatim, nothing logged. The SPA drives the
> whole authorization-code + PKCE + `state` flow itself (`packages/app/src/
oauth.ts`, pure logic): PKCE via `crypto.subtle`, token in memory mirrored to
> `sessionStorage` (never `localStorage`, never a URL), silent single-flight
> refresh, `signOut()` that clears `rcv.oauth.*` and links to GitHub's
> authorization page for true revocation. The mount effect completes an OAuth
> callback (QUERY `?code&state`) before the 007 share-hash decode and restores
> the pre-sign-in fragment, so a share link survives the round-trip. `run.ts`
> `ensureAuth` now prefers the (refreshable) OAuth token over the PAT for
> `githubToken`. The four PAT fields moved from `localStorage` to
> `sessionStorage` with a one-time migration, and the GitHub PAT input moved
> from the toolbar into advanced settings as a labelled fallback. The error-path
> UX — sign-in / "app not installed" hints on failed `github>` preset nodes and
> on GitHub load-from-repo failures — is a shared `GithubAuthHint` component fed
> minimal props (no coupling of `PresetTree` to `oauth.ts`).
>
> **Not yet provisioned (manual steps, documented in
> `packages/oauth-worker/README.md`):** registering the GitHub App
> (Contents:read-only, expiring tokens on, device flow off), deploying the
> Worker + `wrangler secret put GITHUB_CLIENT_SECRET`, and setting the three
> repo Actions variables (`VITE_GITHUB_CLIENT_ID`, `VITE_OAUTH_WORKER_URL`,
> `VITE_GITHUB_APP_SLUG`). Until those exist the build variables are empty and
> the whole feature stays hidden — the app works exactly as before with the PAT
> fallback. One deliberate deviation: the Worker uses TypeScript's built-in
> `WebWorker` lib for runtime globals instead of a `@cloudflare/workers-types`
> devDependency, keeping the install network-free and CI lockfile-stable.

## Summary

Replace the paste-a-PAT field with a "Sign in with GitHub" button. The point
of authenticating is **access to private repositories** — shared org presets
(`extends: ["github>my-org/renovate-config"]`) and, with 007, loading a
config straight from a private repo. Unauthenticated access (60 req/h,
public data only) is perfectly fine for the public-preset case and stays the
default; rate limits are not the motivation, just a side benefit of signing
in.

Asking users to mint and paste a PAT that can read their private repos into
a random web app is exactly the behavior we should not train them in, even
though our field is honest about staying in the browser. A sign-in with an
explicit consent screen, per-repository grants and one-click revocation is
the trustworthy version of the same capability.

## Research findings (July 2026)

The constraint that shapes everything: **a pure static SPA cannot complete
GitHub's OAuth flow on its own.** Three verified facts force this:

1. **`client_secret` is still required at the token exchange**, even though
   GitHub added PKCE support in July 2025. GitHub explicitly does not
   distinguish public from confidential clients, so the OAuth 2.1 "public
   client, PKCE only, no secret" pattern does not work. A secret shipped in
   a browser bundle is public, so it cannot live in the SPA.
   ([changelog](https://github.blog/changelog/2025-07-14-pkce-support-for-oauth-and-github-app-authentication/),
   [authorizing OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps))
2. **No CORS on `github.com/login/*`**: the token exchange endpoint rejects
   browser preflights ("CORS pre-flight requests (OPTIONS) are not supported
   at this time"), while `api.github.com` fully supports CORS. So even the
   secret aside, the browser cannot call the exchange endpoint.
3. **Device flow doesn't rescue us**: it drops the `client_secret`
   requirement, but its endpoints sit on `github.com/login/*` behind the
   same CORS wall, and its UX (copy a code into another tab, poll every 5 s)
   is worse than a redirect.
   ([device flow docs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow))

Therefore every static-site GitHub sign-in in the wild uses a **minimal
token-exchange proxy** — a single serverless endpoint that appends the
secret and forwards the code exchange (the classic "gatekeeper" pattern;
[Simon Willison's Cloudflare Worker writeup](https://til.simonwillison.net/cloudflare/workers-github-oauth)
is the canonical modern example). The SPA does everything else itself.

Other verified facts that size the design:

- **OAuth App vs GitHub App — decisive for private repos.** A classic OAuth
  App's only route to private repo content is the `repo` scope: full
  **read and write** access to **every** repository the user can touch,
  all-or-nothing, forever (classic tokens don't expire). That consent screen
  is scarier than the PAT field we're removing. A
  [GitHub App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)
  (GitHub's recommendation for new apps) inverts this: fine-grained
  permissions (Contents: **read-only** is all we need) and the user access
  token only reaches the intersection of what the user can access and the
  repositories the app was **installed on** — the user picks exactly which
  private repos to grant during install. Tokens expire after 8 h with a
  6-month refresh token; refreshing also requires the `client_secret`, i.e.
  another proxy round-trip.
- **Installation friction is real**: reading an org-owned private preset
  repo requires the app to be installed on that repo, which in many orgs
  needs owner approval. Public repos stay readable to any signed-in user
  regardless of installations. The PAT escape hatch below covers users who
  can't get an installation approved.
- **Rate limits are a side benefit**: any authenticated request gets the
  [5,000 req/h user limit](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
  vs 60 req/h unauthenticated — scopes/permissions gate authorization, not
  rate limits.
- **Token storage**: the
  [OAuth for Browser-Based Apps BCP](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps)
  ranks web storage last (XSS-exfiltratable). Memory-only is the clean
  answer; `sessionStorage` is the pragmatic middle ground if re-auth on
  every reload is too annoying.

## Recommended architecture

- **GitHub App with a single permission: Contents — read-only.** The
  install/consent flow then truthfully says "this app can read the contents
  of the repositories you select, nothing else" — that per-repo, read-only
  grant is the whole trust story, and it's something no classic OAuth App
  can offer for private repos (`repo` scope is read/write to everything).
- **Authorization code flow + PKCE + `state`**, driven entirely by the SPA
  (redirect to GitHub, return to `/callback` route on Pages).
- **Cloudflare Worker token-exchange proxy** (free tier), doing nothing but
  `code → token` (and later `refresh_token → token`):
  - `client_secret` only in the Worker secret store;
  - CORS locked to the exact Pages origin;
  - stateless, no token persistence, no request/response body logging;
  - registered `redirect_uri`s only.
- **Token kept in memory, mirrored to `sessionStorage`** so a reload within
  the 8 h window doesn't force re-auth; never `localStorage`, never in URLs
  (aligns with 007's "never in URL" rule for secrets).
- Silent refresh via the Worker while a refresh token is valid; on failure,
  fall back to the signed-out state (public presets keep working
  unauthenticated).

This is our first (and only) piece of server infrastructure. That's a real
departure from "no backend" (007), so the boundary must stay sharp: **the
Worker never sees a config, a preset, or an API request — only the OAuth
code/refresh exchange passes through it, stateless and unlogged.** All
GitHub content fetches go browser → `api.github.com` directly. Configs still
never leave the browser; the README privacy statement gets updated to say
exactly this.

## Scope

- GitHub App registration (device flow off, expiring tokens on) + Worker
  deployment (repo-managed `wrangler` config, secret via CI).
- SPA: sign-in button with avatar/username chip when signed in, sign-out
  (revoke via API + drop token), callback route, `state`/PKCE handling.
- Engine auth plumbing (`setPresetAuth`) unchanged — it just receives the
  OAuth token instead of a PAT.
- Private-repo UX: when a preset or repo fetch comes back 404/403 while
  signed out, offer sign-in as the likely fix (private presets return 404 to
  strangers); when it fails while signed _in_, explain the app probably
  isn't installed on that repo and link to the app's installation settings
  ("manage repository access"). This error-path guidance is the core UX of
  the feature.
- Rate-limit niceties: surface `x-ratelimit-*` remaining quota and offer
  sign-in on 429s — secondary, since 60 req/h suffices for typical
  public-preset runs.
- Migration: drop the `rcv.githubToken` `localStorage` key. Keep a
  low-profile "use a personal access token instead" escape hatch (advanced
  section) — it stays necessary for GHES users, Worker outages, and orgs
  where the app installation can't be approved — but stop presenting it as
  the primary UX, and move its storage to `sessionStorage` too.

## Out of scope

- Any proxying of API traffic through the Worker (rate-limit laundering,
  caching) — the Worker stays a token exchanger, nothing else.
- GitLab/other platforms (revisit when 007 grows GitLab fetching).
- Installation tokens / acting as an installed app — server-side private
  keys, wrong model for a client-side tool.
- Device flow (CORS-blocked from browsers anyway).

## Dependencies

- None hard; 002 (preset resolution actually fetching `github>` presets) is
  what makes private-preset access matter, and 007's "load from repo" gains
  private-repo support from the same token — ship near those.
