# @renovate-config-visualizer/oauth-worker

A static SPA cannot finish GitHub's OAuth flow on its own: GitHub requires the
`client_secret` at the token exchange (even with PKCE) and serves no CORS on
`github.com/login/*`. This Cloudflare Worker is the minimal gatekeeper that
closes that gap and nothing more — it turns an OAuth `code` (or a
`refresh_token`) into a GitHub user token by appending the secret, and forwards
the result (roadmap [009](../../roadmap/009-github-oauth-sign-in.md)).

> The Worker never sees a config, a preset, or an API request — only the OAuth
> code/refresh exchange passes through it, stateless and unlogged. All GitHub
> content fetches go browser → `api.github.com` directly. The `client_secret`
> lives only in the Worker secret store; request/response bodies and tokens are
> never logged.

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

- Set the vars in `wrangler.jsonc` `vars` (or via the dashboard / `wrangler`):
  `GITHUB_CLIENT_ID` = the App's client id, `ALLOWED_ORIGINS` =
  `https://secustor.github.io,http://localhost:5173`.
- Note the deployed Worker URL, e.g.
  `https://rcv-oauth-worker.<subdomain>.workers.dev`.

### 3. Point the app at it

- **GitHub Pages build** — repo Settings → Secrets and variables → Actions →
  **Variables**: `VITE_GITHUB_CLIENT_ID` = the App's client id,
  `VITE_OAUTH_WORKER_URL` = the Worker URL, `VITE_GITHUB_APP_SLUG` = the App's
  slug (optional; the segment in `https://github.com/apps/<slug>`, enabling a
  direct install/manage link).
- **Docker** — the same three values as `RCV_GITHUB_CLIENT_ID`,
  `RCV_OAUTH_WORKER_URL` and `RCV_GITHUB_APP_SLUG`; see
  [Self-hosting in the root README](../../README.md#self-hosting-docker).
- Until these are set, the app builds cleanly with the feature **off**: no
  sign-in UI, and the personal-access-token fallback (advanced settings) stays
  the only GitHub auth.

## Running it without Cloudflare

```bash
GITHUB_CLIENT_ID=... GITHUB_CLIENT_SECRET=... ALLOWED_ORIGINS=https://rcv.example \
  node packages/oauth-worker/server.mjs        # PORT defaults to 8788
```

`server.mjs` is a dependency-free `node:http` adapter around the same pure
handler, passing headers and body through verbatim — the `Origin` allow-list
stays the security boundary, unchanged. It is what the
`ghcr.io/secustor/renovate-config-visualizer-oauth-proxy` image runs (roadmap
[043](../../roadmap/043-docker-self-host.md)); the provisioning above is
identical either way.

<details>
<summary>Endpoints & configuration reference</summary>

All requests must carry an allow-listed `Origin`; anything else gets `403`
before GitHub is contacted. Responses reflect the exact matched origin (never
`*`).

- `POST /exchange` — body `{ code, code_verifier, redirect_uri }` →
  `authorization_code` grant → GitHub's token JSON verbatim (`access_token`,
  `expires_in`, `refresh_token`, `refresh_token_expires_in`, `token_type`,
  `scope`) or an `{ error, ... }` passthrough.
- `POST /refresh` — body `{ refresh_token }` → `refresh_token` grant, same
  response shape.
- Everything else → `404`. `OPTIONS` preflights are answered for allowed
  origins.

| Name                   | Kind   | Notes                                                       |
| ---------------------- | ------ | ----------------------------------------------------------- |
| `GITHUB_CLIENT_ID`     | var    | GitHub App client id (public).                              |
| `ALLOWED_ORIGINS`      | var    | Comma-separated exact origins allowed to call the Worker.   |
| `GITHUB_CLIENT_SECRET` | secret | GitHub App client secret. Never in `wrangler.jsonc` or git. |

</details>

<details>
<summary>Development</summary>

```bash
pnpm --filter @renovate-config-visualizer/oauth-worker test        # vitest, fetch stubbed
pnpm --filter @renovate-config-visualizer/oauth-worker typecheck
```

The request handler is the pure exported `handleRequest(req, env)` so the tests
run without wrangler. `wrangler` itself is only needed to deploy and is invoked
via `pnpm dlx` (no devDependency, no `node_modules` weight).

</details>
