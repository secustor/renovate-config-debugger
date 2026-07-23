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
  messages and the effective config.
- **Golden tests** prove the shims don't alter behavior: the same fixtures run
  once against untouched Renovate modules and once through the browser module
  graph, and must produce byte-identical results.

Configs never leave the browser except for the preset fetches they themselves
declare. Optional per-host tokens (for rate limits / private repos) are stored
in `localStorage` only.

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
