# Architecture

How the visualizer runs Renovate's own code in the browser.

- `packages/engine` deep-imports the `renovate` package
  (`renovate/dist/config/**`, all in one adapter module) and records the trace;
  `packages/app` is the React SPA that renders it.
- A Vite `resolveId` plugin swaps Node-only internals (OpenTelemetry, bunyan,
  re2, datasource lookups, preset HTTP clients) for browser-safe shims. The
  logger shim doubles as the trace collector, and preset fetching becomes plain
  `fetch()` against CORS-enabled host APIs.
- Golden tests prove the shims don't alter behavior: the same fixtures run
  against untouched Renovate modules and through the browser module graph, and
  must produce byte-identical results.
- Renovate's config code is not a public API, so the dependency is pinned
  exactly and every Renovate release PR runs the full CI.
- `matchCurrentVersion` uses Renovate's real versioning modules for every
  ecosystem except `conda`, whose ~3 MB WebAssembly parser is excluded from the
  bundle (such clauses report an honest error instead).

Per-feature design decisions live in the [roadmap](../roadmap/).
