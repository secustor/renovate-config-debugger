# @renovate-config-visualizer/oauth-worker

A single-purpose Cloudflare Worker: the token-exchange proxy that lets the
static SPA complete "Sign in with GitHub" (roadmap
[009](../../roadmap/009-github-oauth-sign-in.md)).

## Why this exists

A pure static SPA cannot finish GitHub's OAuth flow on its own: GitHub still
requires the `client_secret` at the token exchange (even with PKCE), and it
serves no CORS on `github.com/login/*`. So a minimal serverless "gatekeeper" is
unavoidable. This Worker is that gatekeeper and nothing more — it turns an OAuth
`code` (or a `refresh_token`) into a GitHub user token by appending the secret,
and forwards the result.

### Privacy boundary (also stated in the root README)

> The Worker never sees a config, a preset, or an API request — only the OAuth
> code/refresh exchange passes through it, stateless and unlogged. All GitHub
> content fetches go browser → `api.github.com` directly. The `client_secret`
> lives only in the Worker secret store; request/response bodies and tokens are
> never logged.

## Endpoints

All requests must carry an allow-listed `Origin`; anything else gets `403`
before GitHub is contacted. Responses reflect the exact matched origin (never
`*`).

- `POST /exchange` — body `{ code, code_verifier, redirect_uri }` →
  `authorization_code` grant → GitHub's token JSON verbatim
  (`access_token`, `expires_in`, `refresh_token`, `refresh_token_expires_in`,
  `token_type`, `scope`) or an `{ error, ... }` passthrough.
- `POST /refresh` — body `{ refresh_token }` → `refresh_token` grant, same
  response shape.
- Everything else → `404`. `OPTIONS` preflights are answered for allowed
  origins.

## Configuration

| Name                   | Kind   | Notes                                                       |
| ---------------------- | ------ | ----------------------------------------------------------- |
| `GITHUB_CLIENT_ID`     | var    | GitHub App client id (public).                              |
| `ALLOWED_ORIGINS`      | var    | Comma-separated exact origins allowed to call the Worker.   |
| `GITHUB_CLIENT_SECRET` | secret | GitHub App client secret. Never in `wrangler.jsonc` or git. |

## Provisioning

### 1. Create the GitHub App

Settings → Developer settings → **GitHub Apps** → New GitHub App:

- **Permissions → Repository → Contents: Read-only** — this permission ONLY.
  Nothing else. The consent screen then truthfully reads "read the contents of
  the repositories you select".
- **Expire user authorization tokens: ON** (8 h tokens + 6-month refresh token).
- **Request user authorization (OAuth) during installation: ON**.
- **Enable Device Flow: OFF** (CORS-blocked from browsers anyway).
- **Callback URL**: add both
  - `https://secustor.github.io/renovate-config-visualizer/` (production Pages)
  - `http://localhost:5173/` (local dev)
- Note the **Client ID**, and generate a **Client secret**.

### 2. Deploy the Worker

```bash
cd packages/oauth-worker
pnpm dlx wrangler deploy
pnpm dlx wrangler secret put GITHUB_CLIENT_SECRET   # paste the client secret
```

Set the vars (edit `wrangler.jsonc` `vars`, or via the dashboard / `wrangler`):

- `GITHUB_CLIENT_ID` = the App's client id
- `ALLOWED_ORIGINS` = `https://secustor.github.io,http://localhost:5173`

Note the deployed Worker URL (e.g. `https://rcv-oauth-worker.<subdomain>.workers.dev`).

### 3. Set the repo Actions variables

So the Pages build turns the feature on (Settings → Secrets and variables →
Actions → **Variables**):

- `VITE_GITHUB_CLIENT_ID` = the App's client id
- `VITE_OAUTH_WORKER_URL` = the deployed Worker URL
- `VITE_GITHUB_APP_SLUG` = the App's slug (optional; enables a direct
  install/manage link — the URL segment in
  `https://github.com/apps/<slug>`)

Until these are set, the app builds cleanly with the feature **off**: no
sign-in UI appears and the personal-access-token fallback (advanced settings)
remains the only GitHub auth.

## Development

```bash
pnpm --filter @renovate-config-visualizer/oauth-worker test        # vitest, fetch stubbed
pnpm --filter @renovate-config-visualizer/oauth-worker typecheck
```

The request handler is the pure exported `handleRequest(req, env)` so the tests
run without wrangler. `wrangler` itself is only needed to deploy and is invoked
via `pnpm dlx` (no devDependency, no `node_modules` weight).

## Running it without Cloudflare

That same purity means the Worker does not need Workers. `server.mjs` is a
dependency-free `node:http` adapter around `handleRequest` — it converts the
request, passes headers and body through verbatim (so the `Origin` allow-list
stays the security boundary, unchanged) and writes the response back:

```bash
GITHUB_CLIENT_ID=... GITHUB_CLIENT_SECRET=... ALLOWED_ORIGINS=https://rcv.example \
  node packages/oauth-worker/server.mjs        # PORT defaults to 8788
```

This is what the `ghcr.io/secustor/renovate-config-visualizer-oauth-proxy`
image runs (roadmap [043](../../roadmap/043-docker-self-host.md)); the
provisioning above — the GitHub App, its callback URL, the allow-listed
origins — is identical either way.
