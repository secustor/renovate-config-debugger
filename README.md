# renovate-config-visualizer

Step through what [Renovate](https://github.com/renovatebot/renovate) actually
does with your config — parsing, migration of deprecated options, massaging,
validation, preset resolution and merging — powered by **Renovate's own code
running in your browser**. Think "compiler explorer for Renovate configs".

## How it works

- `packages/engine` runs a config through the real pipeline stages by
  deep-importing the `renovate` npm package (`renovate/dist/config/**`) and
  records a structured trace of events with before/after snapshots and
  JSON-patch deltas. All deep imports live in a single adapter module.
- Node-only internals (OpenTelemetry instrumentation, bunyan logger, re2,
  datasource lookups, preset HTTP clients) are swapped for browser-safe shims
  by a Vite `resolveId` plugin. The logger shim doubles as the trace
  collector. Preset fetching uses plain `fetch()` against the CORS-enabled
  GitHub / GitLab / Gitea / Forgejo / npm APIs (see the support matrix below).
- `packages/app` is a React SPA rendering the trace: config editor with
  Renovate's JSON schema, stage timeline, per-stage diffs, validation
  messages and the effective config. The preset resolution tree stays legible
  even when `extends: ["config:recommended"]` explodes to ~1,100 presets — a
  summary header shows the honest cost (a handful of presets actually change
  top-level options; the rest just contribute grouping packageRules), with
  windowed rendering, contribution roll-ups, search, a flat-table view and a
  "hide zero-contribution routers" toggle.
- A **packageRules simulator**: describe a hypothetical dependency update
  (manager, datasource, package name, versions, update type, …) and see which
  `packageRules` entries match — rule by rule, clause by clause, using
  Renovate's real matcher code — plus the final per-dependency config the
  matching rules merge together. Version ranges (`matchCurrentVersion`) are
  evaluated by Renovate's real versioning modules for every ecosystem except
  `conda`, whose ~3 MB WebAssembly parser is excluded from the browser bundle
  (such clauses report an honest error instead).
- **Golden tests** prove the shims don't alter behavior: the same fixtures run
  once against untouched Renovate modules and once through the browser module
  graph, and must produce byte-identical results.

Configs never leave the browser except for the preset fetches they themselves
declare. Optional per-host tokens (for rate limits / private repos) live in
`sessionStorage` only — they are cleared when you close the tab, and never go
into a URL.

### Privacy & security

- All GitHub/GitLab/Gitea/Forgejo/npm content fetches go **browser →
  host API** directly; nothing proxies your config or presets.
- **Sign in with GitHub** (when enabled — see below) adds exactly one piece of
  server infrastructure: a stateless Cloudflare Worker
  ([`packages/oauth-worker`](packages/oauth-worker)) that does nothing but the
  OAuth `code → token` (and `refresh_token → token`) exchange, because a static
  site cannot hold the `client_secret` GitHub still requires. The Worker
  **never sees a config, a preset, or an API request** — only the OAuth
  exchange passes through it, stateless and unlogged. All content fetches still
  go straight to `api.github.com`.
- Tokens (OAuth or personal access token) live in `sessionStorage`/memory,
  cleared when the tab closes; never `localStorage`, never a URL.

## Preset hosting support

Every fetcher runs in the page, so each host must serve CORS headers. The
public default endpoints below verifiably do; self-hosted endpoints usually do
not, so their presets fall back to manual injection.

| Prefix                                                       | Status               | Notes                                                       |
| ------------------------------------------------------------ | -------------------- | ----------------------------------------------------------- |
| `github>`                                                    | fetched in browser   | `api.github.com` (custom endpoint supported)                |
| `gitlab>`                                                    | fetched in browser   | `gitlab.com` API v4 (custom endpoint supported)             |
| `gitea>`                                                     | fetched in browser   | `gitea.com` API v1 (custom endpoint supported)              |
| `forgejo>`                                                   | fetched in browser   | `codeberg.org` API v1 (custom endpoint supported)           |
| `npm>`                                                       | fetched in browser   | `registry.npmjs.org` (deprecated upstream)                  |
| bare `owner/repo`, `local>`                                  | via platform context | resolves against the toolbar platform + endpoint you select |
| `http(s)://…`                                                | manual only          | arbitrary endpoints rarely serve CORS                       |
| azure / bitbucket / bitbucket-server / gerrit (via `local>`) | not supported        | reachable only via a real Renovate run                      |
| codecommit / scm-manager (via `local>`)                      | not supported        | Renovate itself does not serve local presets there          |

**Platform context** — `local>` (and a bare `owner/repo` reference) is not a
host of its own; it resolves against the repository's platform + endpoint. Pick
these in the toolbar's _Platform context_ control (default `github` /
`https://api.github.com`); the trace records which platform each `local>` node
resolved against.

**Manual preset injection** — any preset a fetcher cannot reach (self-hosted /
air-gapped hosts, or a hypothetical preset) can be supplied by hand: select the
failed node in the resolution tree and paste its JSON into "Provide preset
content manually". The pipeline re-runs using it and the node is flagged
`user-supplied`.

Note: Renovate's config code is not a public API, so the `renovate` dependency
is pinned exactly and every Renovate release PR runs the full CI (golden tests
plus browser build) to catch breakage per release.

## Global + inherited config layers

Self-hosted administrators can paste a **global config** (the JSON form of
`config.js` / env / CLI) and an **inherited config** (`inheritConfig`)
alongside the repo config. The pipeline then models the full layer stack a
real Renovate run uses — defaults → `globalExtends` presets → global config →
inherited config (validated with Renovate's `inherit` rules, its presets
resolved, global-only options stripped) → repo presets → repo config — with
two extra stages in the timeline and `global config` / `inherited config`
badges in the per-key provenance view. Repo configs that try to set
global-only options get Renovate's own boundary warning. `platform` /
`endpoint` from the global config drive the platform-context control: it shows
them marked "from global config", and changing it becomes an explicit,
visibly-warned override.

## Sharing & loading

**Shareable links** — _Copy link_ (next to _Run pipeline_) puts a link on your
clipboard that reopens the current analysis: the config text, the file format,
a non-default platform/endpoint, any global/inherited config layers, and your
current view (selected stage, the selected preset node, the migration step). It is stored compressed in the URL
_fragment_ (`#config=…`), so it never reaches any server log, and opening a link
auto-runs the same pipeline. The link records the Renovate version it was made
with and warns you if you're now on a different one, since results can drift.
Links **never** contain your tokens or any manually injected preset content.

**Load from repo** — type a repository reference into the _Load from repo_ box
and the app fetches its Renovate config for you: `owner/repo`,
`github.com/owner/repo`, a full URL (`https://gitlab.com/org/repo`,
`https://codeberg.org/org/repo`), or an `scp`-style `git@host:org/repo.git`. A
known host (github.com, gitlab.com, gitea.com, codeberg.org) also sets the
platform context so `local>` presets resolve; a bare `owner/repo` uses the
platform context you've selected. An optional _ref_ picks a branch/tag (default
branch otherwise). It probes Renovate's documented config-file locations in
order — `renovate.json{,c,5}`, `.github/`, `.gitlab/`, `.renovaterc{,.json…}`,
then the `package.json` `renovate` key — and tells you which file won. Private
repos use the same GitHub sign-in / per-host tokens as preset fetching (stored
in `sessionStorage` only); hosts that block browser (CORS) requests can't be
reached from the page.

## Sign in with GitHub

Reaching **private** GitHub presets (`extends: ["github>my-org/renovate-config"]`)
or loading a private repo's config needs authentication. The trustworthy way is
a redirect sign-in with an explicit consent screen and a per-repository,
read-only grant — not pasting a personal access token that can read all your
private repos into a web app.

When configured, a **Sign in with GitHub** button appears in the toolbar; it
uses a [GitHub App](packages/oauth-worker/README.md) whose only permission is
**Contents: read-only**, so the consent screen truthfully reads "read the
contents of the repositories you select". Signing in also raises the API rate
limit from 60 to 5,000 requests/hour. Sign-out clears the local token; the chip
also links to GitHub's authorization page for true revocation.

A **personal access token** fallback remains under _Platform context & per-host
tokens_ (advanced settings) for GitHub Enterprise Server, orgs where the app
install can't be approved, or Worker outages.

Sign-in is **off by default**: it only turns on when the deploy provides the
`VITE_GITHUB_CLIENT_ID` and `VITE_OAUTH_WORKER_URL` build variables (plus an
optional `VITE_GITHUB_APP_SLUG`). Without them the app runs exactly as before,
with the PAT fallback as the only GitHub auth. Provisioning (GitHub App +
Worker + repo variables) is documented in
[`packages/oauth-worker/README.md`](packages/oauth-worker/README.md).

## Self-hosting (Docker)

The app is a static bundle, so hosting it is one container:

```bash
docker run -p 8080:80 ghcr.io/secustor/renovate-config-visualizer
```

That is the whole quickstart — <http://localhost:8080> gives you the full
pipeline, the preset tree and the simulator. Sign-in is off (see below); the
per-host personal-access-token fallback is available as it always is. Nothing
in the image phones home, and configs still never leave the browser.

Two images are published from every push to `main`, tagged `latest` and
`sha-<short>`, for `linux/amd64` and `linux/arm64`:

| Image                                                     | What it is                                           |
| --------------------------------------------------------- | ---------------------------------------------------- |
| `ghcr.io/secustor/renovate-config-visualizer`             | the app, served by nginx on port 80                  |
| `ghcr.io/secustor/renovate-config-visualizer-oauth-proxy` | optional OAuth token-exchange proxy, Node, port 8788 |

### Configuration

The app image is configured at **run** time, not build time — one published
image serves both an OAuth-off and an OAuth-on deployment. When both required
variables are set, the container writes a small `/rcv-config.js` at startup and
the sign-in UI appears; otherwise the shipped stub stays and the feature is off.

| Variable               | Required for sign-in | Notes                                                               |
| ---------------------- | -------------------- | ------------------------------------------------------------------- |
| `RCV_GITHUB_CLIENT_ID` | yes                  | Client id of **your own** GitHub App (public value).                |
| `RCV_OAUTH_WORKER_URL` | yes                  | Base URL of the token-exchange proxy **as the browser reaches it**. |
| `RCV_GITHUB_APP_SLUG`  | no                   | The App's slug; enables a direct "install on repositories" link.    |

The proxy image reads the Worker's own variables: `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET` and `ALLOWED_ORIGINS` (comma-separated exact origins —
the origin you serve the app from; anything else is refused with `403` before
GitHub is contacted).

### Sign-in, self-hosted

"Sign in with GitHub" cannot be shipped turned on: it needs a GitHub App that
**you** own, because the callback URL, the consent screen and the client secret
all belong to your deployment. Two things to provision:

1. **A GitHub App** with `Contents: read-only` and your own callback URL —
   step-by-step in
   [`packages/oauth-worker/README.md`](packages/oauth-worker/README.md#provisioning).
2. **The token-exchange proxy**, because a static page cannot hold the
   `client_secret` GitHub still requires at the token exchange. Either deploy
   the Cloudflare Worker from that same README, or run the `-oauth-proxy` image
   — identical code (the request handler is a pure function; the image just
   runs it under Node instead of Workers).

The privacy boundary is unchanged by self-hosting: the proxy only ever sees the
OAuth `code → token` / `refresh_token → token` exchange. It never sees a
config, a preset or an API request, keeps no state and logs no bodies or
tokens; every GitHub content fetch still goes browser → `api.github.com`.

### Compose

[`docker-compose.yml`](docker-compose.yml) is a worked example of both services
with every optional variable present but commented out:

```bash
docker compose up            # published images
docker compose up --build    # build from this checkout instead
```

### Building locally

```bash
docker build --target app -t rcv-app .                    # the app image
docker build --target oauth-proxy -t rcv-oauth-proxy .    # the proxy image
```

The build context is the repo root. TLS termination and reverse-proxy setup are
deliberately out of scope — put the app image behind whatever you already run.

## Development

```bash
mise install       # node + pnpm (or use your own, see package.json engines)
pnpm install
pnpm --filter @renovate-config-visualizer/app dev     # dev server
pnpm test          # golden + shimmed engine tests
pnpm -r typecheck
pnpm lint && pnpm format:check
```

## Project direction

See [roadmap/](roadmap/) for planned features (preset resolution tree, inline
option docs, migration step-through, merge provenance, packageRules
simulator, …).
