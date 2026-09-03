# Architecture

How the app runs Renovate's own code in the browser.

This is the deep description. The operational summary an agent needs day to
day — commands, conventions, constraints — is [AGENTS.md](../AGENTS.md) at the
repository root (`CLAUDE.md` is a symlink to it). Per-feature design decisions
live in the [roadmap](../roadmap/), numbered, one document per feature.

## The packages

A pnpm workspace with four packages.

**`packages/engine`** deep-imports the pinned `renovate` package
(`renovate/dist/config/**`, plus `renovate/dist/modules/manager/**` for
extraction) and records the pipeline trace: parse, migrate, massage, validate,
resolve presets, merge, the packageRules simulator, and the extract phase that
runs Renovate's own managers over a manifest (roadmap 087/090). Two modules —
and only two — hold that deep-import surface: `src/renovate-adapter.ts` for
engine code, and `src/shims/renovate-internals.ts` for the shims (which
cannot go through the adapter without closing an import cycle, since the adapter
re-exports the very `config/presets/index.js` whose children the shims replace).
Both are the places to look when a Renovate release moves a file.

**`packages/app`** is the React 19 SPA that renders the trace. `src/features/`
holds the feature slices (dependencies, editor, effective-config, overview,
pipeline, presets, session, simulator); `src/app/` is the shell;
`src/components/`, `src/hooks/`, `src/lib/`, `src/data/` and `src/platform/` are
shared. Features never import from `@/app` and never from each other — oxlint
overrides mechanize the rule. The engine is imported dynamically, through one
`loadEngine()` seam, so the critical path stays small.

**`packages/cli`** is `rcd`, the headless debugger (roadmap 058, experimental).
Its dev bin boots Vite's SSR module runner with `renovateShims()` active, so the
CLI is the browser module graph running under Node — one subcommand per
question, `--format json` everywhere, hook-grade exit codes, and `rcd mcp`
serving the same answers as MCP tools over a warm engine (roadmap 060). It
imports the app's DOM-free derivations through
`@renovate-config-debugger/app/headless` — the run digest, preset-tree stats,
the effective-config tally — so its numbers are the app's numbers rather than a
copy. Roadmap 059 added the published half: `vite build --ssr` bakes the same
graph into a dependency-free Node bundle (`bin/rcd.mjs` → `dist/main.js`) for
`pnpm dlx`, while `bin/rcd-dev.mjs` keeps serving `src/` in-repo. CI proves the
two agree by re-running the engine's shimmed snapshot suite against the bundle.

**`packages/oauth-worker`** is a stateless OAuth `code → token` exchange, which
exists because a static site cannot hold the `client_secret`. The handler is a
pure function, deployed both as a Cloudflare Worker (`wrangler`) and as a Node
image (`server.mjs`). It must never see configs, presets, or API traffic.

## The shim system (the core trick)

`packages/engine/src/shims/vite-plugin-renovate-shims.ts` exports
`renovateShims()`, a `resolveId` plugin (`enforce: "pre"`) that swaps Renovate's
Node-only choke points for browser-safe shims in `src/shims/`. They fall into
two broad groups: the config/preset choke points (OpenTelemetry
instrumentation, the bunyan logger, the datasource index, the package cache,
merge confidence, the hash util, conda's versioning module, `expose.js` — whose
throwing `re2()` makes `lib/util/regex` fall back to native RegExp — and the
seven per-host preset clients: github, gitlab, gitea, forgejo, npm, http,
local), and the manager-extraction graph added by roadmap 078 (the single
`util/fs` choke point, the got-backed http stack, the heavy lookup-only
datasource leaves, yarn, and the global-agent proxy). The `shimMap` in that file
is the enumeration; read it there rather than here. The logger shim doubles as
the trace collector — **the preset tree and the provenance events exist only in
the shimmed module graph**, because the shims are what emit them. Preset
fetching becomes plain `fetch()` against CORS-enabled host APIs.

Matching is by **exact absolute path**, not by suffix. The plugin resolves
`renovate/package.json` through `createRequire`, which yields the REAL path
(pnpm's `.pnpm/renovate@<version>/node_modules/renovate`, symlinks followed) —
the same path Vite reports as the importer, since Vite resolves symlinks by
default. Every entry of the shim table is joined onto that root at plugin
construction, so the map is keyed on full paths and there is no pattern matching
at resolve time. Two specifier shapes reach it, and each is looked up in three
spellings (as written, `+ ".js"`, `+ "/index.js"`, which is what covers dist's
extensionless imports):

- a **relative** specifier, resolved against the importer's directory — and only
  when the importer is itself inside `renovate/dist`;
- a bare **`renovate/dist/…`** specifier, joined onto the package root.

It has to be `resolveId` rather than `resolve.alias`: the dist modules import
each other through relative, extensionless specifiers (`./github/index.js`),
which aliases never see. The plugin also contributes config — `process.env`
defined as `{}`, `renovate` excluded from prebundling while the CJS/UMD
transitives that need ESM interop are included, and `node:path` aliased to
`pathe` — plus what the npm-extraction graph (roadmap 087) touches at module
scope: defines for `process.platform`, `arch`, `version` and `versions`, and
`graceful-fs`, `node:util` and `node:os` answered with stubs.

The app's `vite.config.ts` copies the same **mechanism** for
`codemirror-json-schema` (cutting a shiki highlighter and the YAML parser out of
the lazy schema chunk), and there matching genuinely is on a path suffix: that
library is resolved from its own nested pnpm directory rather than from a root
the plugin computes, so a suffix is what identifies its two modules.

## Why the shims are trustworthy

Renovate's config code is not a public API. The dependency is pinned exactly,
every Renovate bump PR runs full CI, and `test/migration-drift.node.test.ts`
catches upstream drift in the migration surface specifically.

The proof that the shims do not alter behavior is the engine's two vitest
projects over one set of fixtures and file snapshots, covering the config
pipeline and the manager-extraction cases both. `golden` runs untouched
Renovate modules and writes the reference snapshots; `shimmed` runs the exact
browser module graph (shim plugin, plus `server.deps.inline: [/renovate/]` —
without the inline, Node loads `renovate/dist` natively and the plugin never
sees it) and must produce **byte-identical** results. Both projects glob their
files, and `test/project-coverage.node.test.ts` asserts that every test file
matches exactly one of the two globs — a hand-listed project is how a new test
comes to run in no project at all and pass silently.

## The three module regimes

Each has its own guard, because they fail differently:

1. **Node / vitest** — the golden/shimmed pair above. The app has three
   projects of its own, assigned purely by filename and pinned by
   `src/vitest-projects.test.ts`: `unit` (`src/**/*.test.ts`, node, no DOM and
   no engine), `components` (`src/**/*.test.tsx`, jsdom, no shims, default
   timeout) for ordinary component and hook tests, and `shimmed`
   (`src/**/*.shimmed.test.tsx`, jsdom + shims + inlined renovate, long timeout)
   for the few that run Renovate's own code — the keystroke re-render budget
   test and the panel tests that call `runPipeline` for real.
2. **Production build** — the Playwright e2e suite (`packages/app/e2e/`) drives
   the production build through `vite preview`, never `vite dev`, because dev
   cold-starts can wedge the first engine import. Build the app first locally;
   CI reuses its build artifact.
3. **`vite dev`** — the weakest CJS/ESM interop of the three. `check:dev-graph`
   boots the dev server and fails on Node-only specifiers leaking into the
   graph.

A plain Node import of the engine is not equivalent to any of them: the preset
tree and provenance are reconstructed by the logger shim, so they exist only in
the shimmed graph — which the CLI, the browser bundle and the two `shimmed` test
projects all share.

## Known exclusions

`matchCurrentVersion` uses Renovate's real versioning modules for every
ecosystem except `conda`, whose ~3 MB WebAssembly parser (rattler) is excluded
from the bundle — over half the bundle for one niche scheme. Such clauses report
an honest error instead of a guess.
