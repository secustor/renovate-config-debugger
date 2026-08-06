# @renovate-config-debugger/oauth-worker

A static SPA cannot finish GitHub's OAuth flow on its own: GitHub requires the
`client_secret` at the token exchange (even with PKCE) and serves no CORS on
`github.com/login/*`. This Cloudflare Worker closes that gap and does nothing
else. It turns an OAuth `code` (or a `refresh_token`) into a GitHub user token
by appending the secret, and forwards the result (roadmap
[009](../../roadmap/009-github-oauth-sign-in.md)).

> The Worker never sees a config, a preset, or an API request. Only the OAuth
> code/refresh exchange passes through it, and it keeps no state. All GitHub
> content fetches go browser → `api.github.com` directly. The `client_secret`
> lives only in the Worker secret store, and request/response bodies and tokens
> are never logged.

## Provisioning

### 1. Create the GitHub App

Settings → Developer settings → GitHub Apps → New GitHub App:

- Under Permissions → Repository, grant Contents: Read-only and nothing else.
  The consent screen then truthfully reads "read the contents of the
  repositories you select".
- Turn on "Expire user authorization tokens" (8 h tokens + 6-month refresh
  token).
- Turn on "Request user authorization (OAuth) during installation".
- Leave "Enable Device Flow" off; it is CORS-blocked from browsers anyway.
- Under Callback URL, add both
  - `https://your.example.com` (production)
  - `http://localhost:5173/` (local dev)
- Note the Client ID, and generate a Client secret.

### 2. Deploy the Worker

The recommended path is CI. Once the repo settings below are in place, every
push to `main` deploys the Worker automatically (`.github/workflows/ci.yml`, job
`deploy-oauth-worker`). The job passes `GITHUB_CLIENT_ID` from the repo
variable `VITE_GITHUB_CLIENT_ID`; `ALLOWED_ORIGINS` comes from
`wrangler.jsonc` (`https://renovate.secustor.dev,http://localhost:5173`).

| Name                    | Kind          | Notes                                                                 |
| ----------------------- | ------------- | --------------------------------------------------------------------- |
| `DEPLOY_OAUTH_WORKER`   | repo variable | Set to `true` to enable the deploy job (opt-in, like `DEPLOY_PAGES`). |
| `CLOUDFLARE_API_TOKEN`  | repo secret   | Custom token scoped to `Account → Workers Scripts → Edit`.            |
| `CLOUDFLARE_ACCOUNT_ID` | repo secret   | Dashboard right sidebar, or `wrangler whoami`.                        |

CI never touches `GITHUB_CLIENT_SECRET`. Set it once, from any shell with
Cloudflare credentials; `wrangler deploy` leaves secrets untouched, so it
survives every future deploy:

```bash
cd packages/oauth-worker
pnpm exec wrangler secret put GITHUB_CLIENT_SECRET   # paste the client secret
```

A manual deploy (for bootstrap or as a fallback) runs the same thing CI does:

```bash
cd packages/oauth-worker
pnpm run deploy --var GITHUB_CLIENT_ID:<client id>
```

Note the deployed Worker URL from the deploy output (it is also in the CI job
log), e.g. `https://rcv-oauth-worker.<subdomain>.workers.dev`.

### 3. Point the app at it

For the GitHub Pages build, go to repo Settings → Secrets and variables →
Actions → Variables and set `VITE_GITHUB_CLIENT_ID` to the App's client id and
`VITE_OAUTH_WORKER_URL` to the Worker URL. `VITE_GITHUB_APP_SLUG` is optional:
it is the App's slug, the segment in `https://github.com/apps/<slug>`, and it
enables a direct install/manage link.

For Docker, the same three values are named `RCV_GITHUB_CLIENT_ID`,
`RCV_OAUTH_WORKER_URL` and `RCV_GITHUB_APP_SLUG`; see
[Self-hosting in the root README](../../README.md#self-hosting-docker).

Until these are set, the app builds cleanly with the feature off: there is no
sign-in UI, and the personal-access-token fallback (advanced settings) stays
the only GitHub auth.

## Persistent sign-in (`REFRESH_COOKIE`)

Off by default. With `REFRESH_COOKIE=true` the Worker stops returning the
`refresh_token` in the JSON body and returns it as an `HttpOnly` cookie
instead, so closing the tab no longer ends the session while the long-lived
token stays unreadable to JavaScript (roadmap
[065](../../roadmap/065-persistent-sign-in.md)). The Worker stays stateless —
the cookie _is_ the storage.

The response body then carries `refresh_token_cookie: true` (how the app knows
which mode it is talking to) and keeps `refresh_token_expires_in`; the cookie
is `__Secure-rcv-refresh=<token>; HttpOnly; Secure; SameSite=Strict;
Path=<mount>; Max-Age=<refresh_token_expires_in>`. GitHub rotates refresh
tokens, so every successful `/refresh` re-sets it; a rejected grant and
`POST /logout` clear it.

> **Same-site only.** A cross-site cookie is dropped outright by Safari and by
> every browser with third-party-cookie blocking on. A Worker reached from a
> different site than the app — the `*.workers.dev` URL, a separate host —
> must leave `REFRESH_COOKIE` unset and keep the 009 body protocol; the app
> falls back to the in-memory session it has always had.

Production satisfies that by mounting the Worker on the app's own hostname
with a Cloudflare Workers route, `renovate.secustor.dev/oauth/*` (in
`wrangler.jsonc`). The handler strips one leading `/oauth` segment, so
`/oauth/exchange` and a bare `/exchange` are the same endpoint, and it pins the
cookie `Path` to the mount it was reached through — that is what keeps the
refresh token off the GitHub Pages requests sharing the hostname, and why the
cookie name uses `__Secure-` rather than `__Host-` (which would force `Path=/`).

A Workers route only fires on **proxied (orange-cloud) DNS**: while the
`renovate` record is DNS-only the route is inert and every request falls
through to GitHub Pages. Proxying needs SSL mode Full (strict) — GitHub Pages
holds a valid cert for the hostname.

For the Docker image the same switch is the `REFRESH_COOKIE=true` environment
variable, and the same rule applies: only set it where the proxy is served
over TLS under the app's own origin (a reverse proxy in front of both).

## Running it without Cloudflare

```bash
GITHUB_CLIENT_ID=... GITHUB_CLIENT_SECRET=... ALLOWED_ORIGINS=https://rcv.example \
  node packages/oauth-worker/server.mjs        # PORT defaults to 8788
```

`server.mjs` is a dependency-free `node:http` adapter around the same pure
handler. It passes headers and body through verbatim, so the `Origin`
allow-list stays the security boundary. It is what the
`ghcr.io/secustor/renovate-config-debugger-oauth-proxy` image runs (roadmap
[043](../../roadmap/043-docker-self-host.md)); the provisioning above is
identical either way.

<details>
<summary>Endpoints & configuration reference</summary>

All requests must carry an allow-listed `Origin`; anything else gets `403`
before GitHub is contacted. Responses reflect the exact matched origin (never
`*`).

- `POST /exchange`: body `{ code, code_verifier, redirect_uri }` →
  `authorization_code` grant → GitHub's token JSON verbatim (`access_token`,
  `expires_in`, `refresh_token`, `refresh_token_expires_in`, `token_type`,
  `scope`) or an `{ error, ... }` passthrough.
- `POST /refresh`: body `{ refresh_token }` → `refresh_token` grant, same
  response shape. In cookie mode the token may instead come from the cookie
  (body `{}`); an explicit body token always wins.
- `POST /logout`: clears the refresh cookie in cookie mode. `204` either way.
- Everything else → `404`. `OPTIONS` preflights are answered for allowed
  origins. Each path is also served under an `/oauth` prefix (the Workers
  route); responses always send `access-control-allow-credentials: true`
  alongside the exact reflected origin.

| Name                   | Kind   | Notes                                                       |
| ---------------------- | ------ | ----------------------------------------------------------- |
| `GITHUB_CLIENT_ID`     | var    | GitHub App client id (public).                              |
| `ALLOWED_ORIGINS`      | var    | Comma-separated exact origins allowed to call the Worker.   |
| `REFRESH_COOKIE`       | var    | `true` enables the refresh cookie above. Same-site only.    |
| `GITHUB_CLIENT_SECRET` | secret | GitHub App client secret. Never in `wrangler.jsonc` or git. |

</details>

<details>
<summary>Development</summary>

```bash
pnpm --filter @renovate-config-debugger/oauth-worker test        # vitest, fetch stubbed
pnpm --filter @renovate-config-debugger/oauth-worker typecheck
```

The request handler is the pure exported `handleRequest(req, env)` so the tests
run without wrangler. `wrangler` itself is only needed to deploy and is a
pinned devDependency of this package (`pnpm run deploy`).

</details>
