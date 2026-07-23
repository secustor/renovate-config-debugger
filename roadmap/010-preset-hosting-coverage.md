# 010 — Preset hosting coverage + `local>` semantics

Milestone: M2 · Status: done 2026-07-23

> Implemented as specified. New `gitlab` / `gitea` / `forgejo` fetcher shims
> mirror `github.ts` (plain `fetch` + Renovate's own `fetchPreset`/`parsePreset`
> for the file-candidate and sub-preset logic); Gitea/Forgejo share one
> contents-API helper that decodes base64 with browser-native `atob` (no Node
> `Buffer`). Default endpoints are the CORS-verified public hosts — `gitlab.com`,
> `gitea.com`, and (deviating from upstream's `code.forgejo.org`, which sends no
> CORS) `codeberg.org` for Forgejo. `setPresetAuth` grew per-host token fields
> (GitLab `PRIVATE-TOKEN`, Gitea/Forgejo `Authorization: token`). `local>`
> resolves through Renovate's real `GlobalConfig` `platform`/`endpoint` — set
> from new `PipelineInput.platform`/`endpoint` run options — so the upstream
> dispatch logic is reproduced unchanged; unsupported platforms fail with honest
> per-platform messages instead of a generic stub. A module-level injection
> registry (keyed by a canonical `presetInjectionKey`) lets every fetcher serve
> user-supplied content before hitting the network; the trace reports which keys
> were used so the UI flags `user-supplied` nodes. `PresetSourceRef` gained
> `platform`/`endpoint` (populated for `local>` nodes only) and `TraceResult`
> gained `platformContext` + `usedInjections`.

## Summary

Support the full set of [preset hosting
options](https://docs.renovatebot.com/config-presets/#preset-hosting)
Renovate offers — not just `github>` — and give `local>` a defined meaning
in a browser tool. Today the engine ships real fetchers for `github`, `npm`
and `http` only; `gitlab`, `gitea`, `forgejo` and `local` are stubs that
reject with "not supported in the browser yet"
(`packages/engine/src/shims/presets/`). Any config from a GitLab or
Gitea/Forgejo shop — or any config using `local>`/bare `owner/repo`
references — currently dies in the preset stage.

## What `local>` actually is

Verified against Renovate's source
(`lib/config/presets/local/index.ts`): `local>` is not a distinct host. It
reads the **global config** `platform` and `endpoint` options and delegates
to that platform's preset fetcher:

- `github` / `gitlab` / `gitea` / `forgejo` → the same resolvers as the
  explicit prefixes, but pointed at the configured endpoint;
- `azure` / `bitbucket` / `bitbucket-server` / `gerrit` → a generic
  platform-API fetcher — these platforms are reachable **only** via
  `local>`, they have no prefix of their own;
- `codecommit` / `scm-manager` → "platform does not support local presets".

A bare reference with no prefix (`"extends": ["owner/repo"]`) is shorthand
for `local>`. So `local>` is meaningless without an answer to "which
platform and endpoint is this config running on?" — context a real Renovate
run gets from its global config and a browser tool must get from the user.

## Scope

### Platform context

Introduce an explicit **platform context** — `platform` + `endpoint` — that
defines `local>`:

- Toolbar/settings control, default `github` / `https://api.github.com`;
  persisted like the file-format choice.
- Interplay with 008's global-config layer (where `platform`/`endpoint`
  genuinely live): when the pasted global config sets them, the UI control
  **reflects those values** — it shows what the global config says, marked
  as "from global config", rather than silently keeping its own state. The
  user can still change the control, which becomes an explicit **override
  with a visible warning** ("overriding `platform`/`endpoint` from global
  config — a real Renovate run would use gitlab / https://…"), and the
  trace records that the run used overridden values. Clearing the override
  snaps back to the global-config values.
- 007's "load from repo" auto-derives the context from the repo URL (a
  config loaded from `gitlab.com/org/repo` gets `platform: gitlab` —
  `local>` then resolves the way it would in that repo's actual Renovate
  run); an explicit global config still wins over the derived value, with
  the same reflect-then-override behavior.
- Engine: set/read this through `GlobalConfig` exactly as upstream does, so
  the untouched `local/index.ts` dispatch logic keeps working; the visited
  preset trace records which platform+endpoint a `local>` node resolved
  against (002 shows it on the node badge).

### New fetchers

- `gitlab`, `gitea`, `forgejo` shims mirroring the existing `github.ts`
  pattern (plain `fetch` against the platform REST API, default endpoints
  `gitlab.com` / `gitea.com` / `codeberg.org`, custom endpoint support,
  tag/path handling per upstream's resolvers, same
  `ExternalHostError`-vs-not-found mapping).
- Per-host tokens: extend `setPresetAuth` beyond `githubToken` to a
  host→credential map (GitLab uses `PRIVATE-TOKEN`/Bearer, Gitea/Forgejo
  `token` auth). 009's OAuth sign-in stays GitHub-only; other hosts get
  advanced PAT fields, same storage rules as 009's escape hatch.
- `azure`/`bitbucket`/`bitbucket-server`/`gerrit` via `local>`: implement
  the generic fetcher only if the platform APIs are browser-reachable
  (below); otherwise fail with an honest per-platform message instead of
  the generic stub error.

### The CORS reality

Every fetcher runs in the page, so each host must serve CORS headers.
`api.github.com` and `registry.npmjs.org` verifiably do. For
`gitlab.com`, `gitea.com`, `codeberg.org` and the local-only platform APIs
this must be **verified empirically early** — it decides how much of this
feature is buildable at all. Self-hosted endpoints (the main audience for
`local>`) will often not send CORS headers. Design for failure being
common:

- Distinguish "CORS/network blocked" from "preset not found" in the error
  the 002 tree shows (the `github.ts` shim already sets this pattern), and
  say which endpoint was tried and why it likely failed.
- **Manual preset injection as the universal fallback**: on any
  unreachable node, let the user paste that preset's JSON; the node is
  marked "user-supplied" and resolution continues with it. This keeps the
  visualizer useful for air-gapped/self-hosted setups no fetcher will ever
  reach — and doubles as a way to explore hypothetical presets.
- No API proxying through the 009 Worker — its token-exchange-only
  boundary stands. If demand for a CORS relay materializes, that is a
  separate decision with its own privacy story (preset traffic would leave
  the browser).

### Docs / UX

- README + in-app: a support matrix (prefix → status: fetched / via
  platform context / manual-only), replacing the current implicit
  "GitHub-only" reality.
- 002's source badges gain `gitea` / `forgejo` and show the resolved
  platform for `local>` nodes.

## Out of scope

- Merge-confidence / other `http` uses beyond what already works.
- `npm` presets beyond the existing shim (deprecated upstream).
- Any server-side fetching or CORS proxy (see above).
- Platform context influencing anything besides preset resolution (008
  owns the full global-config semantics).

## Dependencies

- 001 (shim seam exists); surfaces through 002's tree. Feeds 007 (repo URL
  → platform context) and 008 (`platform`/`endpoint` as global options).
