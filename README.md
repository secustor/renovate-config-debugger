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
  GitHub/npm APIs.
- `packages/app` is a React SPA rendering the trace: config editor with
  Renovate's JSON schema, stage timeline, per-stage diffs, validation
  messages and the effective config.
- **Golden tests** prove the shims don't alter behavior: the same fixtures run
  once against untouched Renovate modules and once through the browser module
  graph, and must produce byte-identical results.

Configs never leave the browser except for the preset fetches they themselves
declare. The optional GitHub token (for rate limits) is stored in
`localStorage` only.

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
