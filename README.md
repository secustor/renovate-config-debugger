<p align="center">
  <img src="packages/app/public/logo-192.png" width="120" alt="Renovate Config Debugger logo" />
</p>

# renovate-config-visualizer

Step through what [Renovate](https://github.com/renovatebot/renovate) actually
does with your config: parsing, migration of deprecated options, massaging,
validation, preset resolution and merging. It runs Renovate's own code in your
browser. Think "compiler explorer for Renovate configs".

**[Try it live](https://renovate.secustor.dev/)**, or run it yourself:

```bash
docker run -p 8080:80 ghcr.io/secustor/renovate-config-visualizer   # http://localhost:8080
```

Paste this into the config editor and press _Run pipeline_ or simply [open it with the below content filled](https://renovate.secustor.dev/#config=PZDNToQwFIVfpTlxWRnHEE36Bi50YXRlZ1HKHUCnP2kvqCG8uykDLpvzfeekd8YEdS-RyIfJMEGhrqu6eoCEDf48dFCYtRdC4ybbnpzRUEKjZ45ZHQ5tsLna7SZwZYM77O_bq1F95uA15LWGfph8m0vNh95GVCIbnCPfUqtx2khnMlN6ynmkQnMaaUuisV-mo9fxQluRF0KIeZXY9s_Gm47SPuKjK617-h5bw_T2G3cZbvAhbUiXwhhfjFs3V1dssVjKzEn7RXtInIcLFQ7q_3zrT8vpoHBMj0M-NpCYBvqGmpHZdIWOiTIxJDJThLqTYNNAIUyUVnZZ_gA):

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

- The pipeline stage by stage, as a structured trace with before/after
  snapshots, JSON-patch deltas and Renovate's own validation messages.
- A preset tree that survives `config:recommended`. Its ~1,100 presets stay
  legible: a summary header shows the honest cost (a handful change top-level
  options, the rest contribute grouping packageRules), and there are roll-ups,
  search, a flat table and a "hide zero-contribution routers" toggle.
- A packageRules simulator. Describe a hypothetical update and it shows which
  entries match, rule by rule and clause by clause, using Renovate's real
  matcher code, plus the per-dependency config those rules merge to.
- Per-key provenance, so you can see which layer set each key, including the
  self-hosted global and inherited layers below.
- Share links. _Copy link_ reopens the current analysis (config, format,
  platform context, layers, view) from the URL _fragment_, so it never reaches a
  server log. It warns if the Renovate version has drifted, and it never carries
  tokens or manually injected presets.
- Load from repo. Give it `owner/repo`, a full URL or `git@host:org/repo.git`
  with an optional ref: it probes Renovate's documented config-file locations,
  says which file won, and sets the platform context for known hosts. It also
  offers (on by default) to bring the org's inherited config along, resolved the
  way a real `inheritConfig` run resolves it, from `org-inherited-config.json`
  in `{{parentOrg}}/renovate-config`. Both are editable before you load.

<details>
<summary>Global + inherited config layers (self-hosted admins)</summary>

Paste a global config (the JSON form of `config.js` / env / CLI) and an
inherited config (`inheritConfig`, or let a repo load fetch it) alongside the repo config, and the
pipeline models the full stack as two extra timeline stages with matching
provenance badges: defaults → `globalExtends` presets → global config →
inherited config (validated with Renovate's `inherit` rules, presets resolved,
global-only options stripped) → repo presets → repo config. Repo configs setting
global-only options get Renovate's own boundary warning, and `platform` /
`endpoint` from the global config drive the platform-context control, so
overriding them is explicit and visibly warned.

</details>

## Self-hosting (Docker)

> [!WARNING]
> Docker setups are experimental at the moment.

The app is a static bundle, so hosting it is the one container above. There is
also [`docker-compose.yml`](docker-compose.yml), a worked example of both
services with every optional variable present but commented out:

```bash
docker compose up            # published images
docker compose up --build    # build from this checkout instead
```

The two services are the app image above and the optional
`ghcr.io/secustor/renovate-config-visualizer-oauth-proxy` (token exchange, Node,
port 8788). Both are configured at run time, not build time, so one image serves
an OAuth-off and an OAuth-on deployment. With both required variables set the
container writes `/rcv-config.js` at startup and the sign-in UI appears;
otherwise the shipped stub stays and the feature is off.

| Variable                | Required for sign-in | Notes                                                               |
| ----------------------- | -------------------- | ------------------------------------------------------------------- |
| `RCV_GITHUB_CLIENT_ID`  | yes                  | Client id of **your own** GitHub App (public value).                |
| `RCV_OAUTH_WORKER_URL`  | yes                  | Base URL of the token-exchange proxy **as the browser reaches it**. |
| `RCV_GITHUB_APP_SLUG`   | no                   | The App's slug; enables a direct "install on repositories" link.    |
| `RCV_GA_MEASUREMENT_ID` | no                   | GA4 measurement id (`G-…`); enables Google Analytics. Off unset.    |

<details>
<summary>Sign in with GitHub, self-hosted</summary>

Sign-in cannot ship turned on: the callback URL, consent screen and client
secret all belong to your deployment. You provision two things, both covered
step by step in
[`packages/oauth-worker/README.md`](packages/oauth-worker/README.md#provisioning):

1. A GitHub App you own, with `Contents: read-only` and your callback URL.
2. The token-exchange proxy, because a static page cannot hold the
   `client_secret` GitHub still requires. Deploy the Cloudflare Worker, or run
   the `-oauth-proxy` image. Both run identical code (the handler is a pure
   function; the image runs it under Node). It reads `GITHUB_CLIENT_ID`,
   `GITHUB_CLIENT_SECRET` and `ALLOWED_ORIGINS` (comma-separated exact origins,
   meaning the origin you serve the app from; anything else is refused with
   `403` before GitHub is contacted).

Self-hosting does not move the privacy boundary. The proxy only ever sees the
`code → token` / `refresh_token → token` exchange, never a config, a preset or
an API request. It keeps no state and logs no bodies or tokens, and every
content fetch still goes browser → `api.github.com`.

</details>

<details>
<summary>Building the images locally</summary>

```bash
docker build --target app -t rcv-app .                    # the app image
docker build --target oauth-proxy -t rcv-oauth-proxy .    # the proxy image
```

The build context is the repo root. TLS termination and reverse-proxy setup are
deliberately out of scope. Put the app image behind whatever you already run.

</details>

## Development

```bash
mise install       # node + pnpm (or use your own, see package.json engines)
pnpm install
pnpm dev     # dev server
pnpm test          # every workspace test except e2e (which needs a build first)
pnpm typecheck
pnpm lint && pnpm format:check
```

[docs/Architecture.md](docs/Architecture.md) covers how it all works: the shim
plugin, the golden tests, the pinned Renovate.

<details>
<summary>Privacy, tokens & GitHub sign-in</summary>

- Configs never leave the browser except for the preset fetches they themselves
  declare; all GitHub/GitLab/Gitea/Forgejo/npm content fetches go browser →
  host API directly, with nothing proxying your config or presets.
- Tokens (OAuth or personal access token) live in `sessionStorage`/memory and
  are cleared when the tab closes. They never go into `localStorage` or into a
  URL.
- Sign in with GitHub adds exactly one piece of server infrastructure: the
  stateless [`packages/oauth-worker`](packages/oauth-worker), which does nothing
  but the OAuth `code → token` / `refresh_token → token` exchange, because a
  static site cannot hold the `client_secret` GitHub still requires. It never
  sees a config, a preset, or an API request.
- Private presets and private repo configs need auth. The GitHub App's only
  permission is Contents: read-only, so the consent screen truthfully reads
  "read the contents of the repositories you select"; signing in also raises the
  rate limit from 60 to 5,000 requests/hour. Sign-out clears the local token,
  and the chip links to GitHub's authorization page for true revocation.
- Sign-in is off by default. It turns on only when the deploy provides
  `VITE_GITHUB_CLIENT_ID` and `VITE_OAUTH_WORKER_URL` (plus optional
  `VITE_GITHUB_APP_SLUG`) or their `RCV_*` equivalents. Otherwise a personal
  access token under _Platform context & per-host tokens_ is the only GitHub
  auth, and it is also the fallback for GitHub Enterprise Server, orgs that
  can't approve the app install, or Worker outages.

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

`local>` and bare `owner/repo` are not hosts of their own. They resolve against
the platform + endpoint picked in the toolbar's _Platform context_ control
(default `github` / `https://api.github.com`), and the trace records which one
each node used.

Any preset a fetcher cannot reach (self-hosted or air-gapped hosts, a
hypothetical preset) can be supplied by hand. Select the failed node in the
resolution tree and paste its JSON into "Provide preset content manually". The
pipeline re-runs with it and flags the node `user-supplied`.

</details>

## Project direction

See [roadmap/](roadmap/) for planned features.
