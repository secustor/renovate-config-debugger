# 043 — Docker self-host distribution

Milestone: M11 · Status: done (2026-07-26)

## Summary

A user request: make the app installable, not just visitable. Everything the
visualizer does happens in the browser, so a self-hoster needs nothing but a
static file server — but "clone the repo, install pnpm 11, run a Vite build"
is a developer workflow, not a distribution. This item publishes two container
images from `main`: the app behind nginx, and (optional) the OAuth
token-exchange proxy for deployments that want "Sign in with GitHub".

## Scope

- **Runtime OAuth config.** The blocker: sign-in (009) is enabled by
  `VITE_GITHUB_CLIENT_ID` / `VITE_OAUTH_WORKER_URL`, and Vite **inlines**
  `import.meta.env.VITE_*` into the bundle at build time. Build args were
  rejected on that basis alone — a published image would carry one operator's
  client id forever, so every self-hoster wanting sign-in would have to rebuild
  the image, which defeats publishing it. Instead the deploy writes a served
  file: `public/rcv-config.js` (a comment-only stub, so every deploy serves it
  and nothing 404s) may define `globalThis.__RCV_OAUTH__`, and
  `getOAuthConfig()` prefers it over the build-time vars. `index.html` loads it
  as a classic script before the module entry. The GitHub Pages build is
  untouched: it ships the empty stub and keeps reading its Actions variables.
- **The Node adapter.** `handleRequest(req, env)` in the Worker was written as
  a pure `(Request, Env) => Response` so it could be unit-tested without
  wrangler; that purity is exactly what makes Cloudflare optional.
  `packages/oauth-worker/server.mjs` is a ~70-line `node:http` shim around it —
  no framework, no dependencies, and no build step in the image, because Node
  26 strips the types from the Worker's erasable-syntax-only source itself. The
  adapter adds no policy: headers (the `Origin` the allow-list turns on) and
  bodies are copied verbatim both ways, so the Worker's CORS boundary is the
  same code making the same decision on both runtimes.
- **What a self-hoster still provisions.** Their **own GitHub App**. The
  callback URL, the consent screen and the client secret belong to the
  deployment; nothing about them can be baked into a shared image. Sign-in is
  therefore off in the default `docker run`, with the per-host PAT fallback
  available as always.
- **Two images, not one.** The proxy is not part of the app: an
  OAuth-off deployment must not have to run a Node process, and the privacy
  boundary is easier to state when the thing that touches a credential is a
  separate, separately-optional container.

## Out of scope

- **TLS termination and reverse-proxy specifics.** The image speaks plain HTTP
  on :80 and is meant to sit behind whatever the host already runs. Note that a
  real sign-in deployment needs HTTPS anyway — that is the proxy's
  `ALLOWED_ORIGINS` value, not something the image can arrange.
- Helm charts, systemd units, or a one-click PaaS template.

## Dependencies

- 009 (the sign-in flow and the Worker whose pure handler this reuses),
  031 (the chunking the nginx cache policy assumes: content-hashed
  `/assets/*` immutable, `index.html` never).

## What was done

- **`packages/app/public/rcv-config.js`** — comment-only stub, copied verbatim
  by Vite, referenced from `index.html` by a classic `<script src>` placed
  before the module entry (Vite rewrites the root-absolute URL with `base`, so
  the Pages build still resolves it).
- **`getOAuthConfig()` reads two sources.** The validity rule — both ids
  present and non-blank, trailing slashes stripped off the worker URL — moved
  into one `toOAuthConfig` helper that both sources go through, so the runtime
  path cannot drift from the env path. `globalThis.__RCV_OAUTH__` is declared
  `unknown` in `vite-env.d.ts` (it is a served file, not a build constant) and
  every field is type-checked; anything malformed falls through to the vars.
  Callers are untouched — the function's contract is unchanged.
- **`Dockerfile`** (root, three stages). `build` on the `mise` image, which
  installs node and pnpm from `mise.toml` — so the versions are stated once and
  arrive checksum- and attestation-verified, rather than via an
  `npm install --global pnpm@x` that OpenSSF Scorecard reads as unpinned. It
  copies the four manifests plus the lockfile before the sources for layer
  caching,
  and runs the app build with **no** `VITE_*` in the environment. `app` on
  `nginx:alpine` adds `docker/nginx.conf` (gzip; `/assets/` immutable for a
  year; `index.html` and `rcv-config.js` `no-cache`; `nosniff`; a `try_files`
  SPA fallback that never actually fires, since the app routes by hash/query)
  and `docker/40-rcv-config.sh` in `/docker-entrypoint.d/`, which the official
  image runs on start — it writes `rcv-config.js` only when both `RCV_*` ids
  are set, escaping the values for a JS string literal. `oauth-proxy` on
  `node:26.5.0-alpine` copies the Worker source plus `server.mjs` and runs it
  as the `node` user; nothing is installed.
- **`.dockerignore`, `docker-compose.yml`** — a lean context, and a two-service
  worked example with every optional variable present but commented.
- **CI `docker` + `docker-merge` jobs** — `needs: checks`, push-only,
  `packages: write`. `docker` is a (target × platform) matrix, `linux/amd64` on
  `ubuntu-latest` and `linux/arm64` on the native `ubuntu-24.04-arm` runner —
  no qemu, both architectures in parallel — each pushing its platform by digest
  with a per-(target, platform) `type=registry` layer cache in GHCR
  (`:buildcache-linux-<arch>`). `docker-merge` then joins the digests of one
  target into the `latest` + `sha-<short>` manifest list with
  `docker buildx imagetools create`, and inspects it.
- **Docs** — a "Self-hosting (Docker)" section in the root README (quickstart,
  the `RCV_*` table, the sign-in story with the privacy boundary restated,
  compose, local build) and a note in the Worker README that the same handler
  ships as a Node image.
- Verification: `pnpm lint` (silent), `pnpm -r typecheck`, `pnpm format:check`,
  the Worker tests (untouched), app `test:unit` (186 tests — 8 new for the
  config precedence), `build` (dist carries `rcv-config.js`, `index.html`
  references it), all 49 e2e tests, and both images built and exercised: the
  stub served `no-cache`, `/assets/` `immutable`, `__RCV_OAUTH__` appearing
  when the two `RCV_*` variables are passed, and the proxy answering `403`
  without an `Origin` and reaching GitHub with an allow-listed one.
