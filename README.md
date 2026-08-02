<p align="center">
  <img src="packages/app/public/logo-192.png" width="120" alt="Renovate Config Debugger logo" />
</p>

# renovate-config-visualizer

Step through what [Renovate](https://github.com/renovatebot/renovate) actually
does with your config — parsing, migration of deprecated options, massaging,
validation, preset resolution and merging — powered by **Renovate's own code
running in your browser**. Think "compiler explorer for Renovate configs".

**[Try it live](https://secustor.github.io/renovate-config-visualizer/)**, or run it yourself:

```bash
docker run -p 8080:80 ghcr.io/secustor/renovate-config-visualizer   # http://localhost:8080
```

Paste this into the config editor and press _Run pipeline_:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "masterIssue": true,
  "packageRules": [
    { "matchManagers": ["npm"], "matchUpdateTypes": ["minor"], "groupName": "npm minor" }
  ]
}
```

Migration rewrites the deprecated `masterIssue` into `dependencyDashboard`,
`extends` explodes into the preset resolution tree, and the simulator tells you
which updates that `packageRules` entry actually matches.

## What it shows

- **The pipeline, stage by stage** — a structured trace with before/after
  snapshots, JSON-patch deltas and Renovate's own validation messages.
- **A preset tree that survives `config:recommended`** — ~1,100 presets stay
  legible: a summary header shows the honest cost (a handful change top-level
  options, the rest contribute grouping packageRules), plus roll-ups, search, a
  flat table and a "hide zero-contribution routers" toggle.
- **A packageRules simulator** — describe a hypothetical update and see which
  entries match, rule by rule and clause by clause, using Renovate's real
  matcher code, plus the per-dependency config those rules merge to.
- **Per-key provenance** — which layer set each key, including the self-hosted
  global/inherited layers below.
- **Share links** — _Copy link_ reopens the current analysis (config, format,
  platform context, layers, view) from the URL _fragment_, so it never reaches a
  server log; it warns if the Renovate version has drifted, and never carries
  tokens or manually injected presets.
- **Load from repo** — `owner/repo`, a full URL or `git@host:org/repo.git` with
  an optional ref: it probes Renovate's documented config-file locations, says
  which file won, and sets the platform context for known hosts. It also offers
  (on by default) to bring the org's **inherited config** along, resolved the way
  a real `inheritConfig` run resolves it — `org-inherited-config.json` in
  `{{parentOrg}}/renovate-config`, both editable before you load.

<details>
<summary>Global + inherited config layers (self-hosted admins)</summary>

Paste a **global config** (the JSON form of `config.js` / env / CLI) and an
**inherited config** (`inheritConfig`, or let a repo load fetch it) alongside the repo config, and the
pipeline models the full stack as two extra timeline stages with matching
provenance badges: defaults → `globalExtends` presets → global config →
inherited config (validated with Renovate's `inherit` rules, presets resolved,
global-only options stripped) → repo presets → repo config. Repo configs setting
global-only options get Renovate's own boundary warning, and `platform` /
`endpoint` from the global config drive the platform-context control, so
overriding them is explicit and visibly warned.

</details>

## Self-hosting (Docker)

The app is a static bundle, so hosting it is the one container above — or
[`docker-compose.yml`](docker-compose.yml), a worked example of both services
with every optional variable present but commented out:

```bash
docker compose up            # published images
docker compose up --build    # build from this checkout instead
```

Every push to `main` publishes `ghcr.io/secustor/renovate-config-visualizer`
(the app, nginx, port 80) and `…-oauth-proxy` (optional token-exchange proxy,
Node, port 8788), tagged `latest` and `sha-<short>` for `linux/amd64` and
`linux/arm64`. They are configured at **run** time, so one image serves an
OAuth-off and an OAuth-on deployment: with both required variables set the
container writes `/rcv-config.js` at startup and the sign-in UI appears,
otherwise the shipped stub stays and the feature is off.

| Variable                | Required for sign-in | Notes                                                               |
| ----------------------- | -------------------- | ------------------------------------------------------------------- |
| `RCV_GITHUB_CLIENT_ID`  | yes                  | Client id of **your own** GitHub App (public value).                |
| `RCV_OAUTH_WORKER_URL`  | yes                  | Base URL of the token-exchange proxy **as the browser reaches it**. |
| `RCV_GITHUB_APP_SLUG`   | no                   | The App's slug; enables a direct "install on repositories" link.    |
| `RCV_GA_MEASUREMENT_ID` | no                   | GA4 measurement id (`G-…`); enables Google Analytics. Off unset.    |

`RCV_GA_MEASUREMENT_ID` names **your** property, so it is honoured on any
hostname — including a container reached at `localhost:8080`. The hosted
build's own id is the opposite: it is ignored on loopback hostnames, so a local
preview or a browser test of this repo never reports to it.

<details>
<summary>Sign in with GitHub, self-hosted</summary>

Sign-in cannot ship turned on: the callback URL, consent screen and client
secret all belong to your deployment. Provision two things — both step-by-step
in [`packages/oauth-worker/README.md`](packages/oauth-worker/README.md#provisioning):

1. **A GitHub App you own**, with `Contents: read-only` and your callback URL.
2. **The token-exchange proxy**, because a static page cannot hold the
   `client_secret` GitHub still requires. Deploy the Cloudflare Worker, or run
   the `-oauth-proxy` image — identical code (the handler is a pure function;
   the image runs it under Node). It reads `GITHUB_CLIENT_ID`,
   `GITHUB_CLIENT_SECRET` and `ALLOWED_ORIGINS` (comma-separated exact origins —
   the origin you serve the app from; anything else is refused with `403` before
   GitHub is contacted).

Self-hosting does not move the privacy boundary: the proxy only ever sees the
`code → token` / `refresh_token → token` exchange, never a config, a preset or
an API request; it keeps no state and logs no bodies or tokens, and every
content fetch still goes browser → `api.github.com`.

</details>

<details>
<summary>Building the images locally</summary>

```bash
docker build --target app -t rcv-app .                    # the app image
docker build --target oauth-proxy -t rcv-oauth-proxy .    # the proxy image
```

The build context is the repo root. TLS termination and reverse-proxy setup are
deliberately out of scope — put the app image behind whatever you already run.

</details>

## Development

```bash
mise install       # node + pnpm (or use your own, see package.json engines)
pnpm install
pnpm --filter @renovate-config-visualizer/app dev     # dev server
pnpm test          # golden + shimmed engine tests
pnpm -r typecheck
pnpm lint && pnpm format:check
```

How it all works — the shim plugin, the golden tests, the pinned Renovate —
lives in [docs/Architecture.md](docs/Architecture.md).

<details>
<summary>Privacy, tokens & GitHub sign-in</summary>

- Configs never leave the browser except for the preset fetches they themselves
  declare; all GitHub/GitLab/Gitea/Forgejo/npm content fetches go **browser →
  host API** directly, with nothing proxying your config or presets.
- Tokens (OAuth or personal access token) live in `sessionStorage`/memory,
  cleared when the tab closes; never `localStorage`, never a URL.
- **Sign in with GitHub** adds exactly one piece of server infrastructure: the
  stateless [`packages/oauth-worker`](packages/oauth-worker), which does nothing
  but the OAuth `code → token` / `refresh_token → token` exchange, because a
  static site cannot hold the `client_secret` GitHub still requires. It **never
  sees a config, a preset, or an API request**.
- Private presets and private repo configs need auth. The GitHub App's only
  permission is **Contents: read-only**, so the consent screen truthfully reads
  "read the contents of the repositories you select"; signing in also raises the
  rate limit from 60 to 5,000 requests/hour. Sign-out clears the local token,
  and the chip links to GitHub's authorization page for true revocation.
- Sign-in is **off by default**, turning on only when the deploy provides
  `VITE_GITHUB_CLIENT_ID` and `VITE_OAUTH_WORKER_URL` (plus optional
  `VITE_GITHUB_APP_SLUG`) or their `RCV_*` equivalents. Otherwise a **personal
  access token** under _Platform context & per-host tokens_ is the only GitHub
  auth — also the fallback for GitHub Enterprise Server, orgs that can't approve
  the app install, or Worker outages.

</details>

<details>
<summary>Preset hosting & CORS support</summary>

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

**Platform context** — `local>` and bare `owner/repo` are not hosts of their
own; they resolve against the platform + endpoint picked in the toolbar's
_Platform context_ control (default `github` / `https://api.github.com`), and
the trace records which one each node used.

**Manual preset injection** — any preset a fetcher cannot reach (self-hosted or
air-gapped hosts, a hypothetical preset) can be supplied by hand: select the
failed node in the resolution tree and paste its JSON into "Provide preset
content manually". The pipeline re-runs with it, flagging the node
`user-supplied`.

</details>

## Project direction

See [roadmap/](roadmap/) for planned features.
