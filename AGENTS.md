# Agents.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Compiler explorer for Renovate configs": a static React SPA that runs **Renovate's own config code in the browser** — parsing, migration, massaging, validation, preset resolution, merging, and a packageRules simulator — and renders the trace. Big-picture rationale: `docs/Architecture.md`. Per-feature design decisions: `roadmap/` (numbered docs, one per feature).

## Commands

```bash
mise install && pnpm install   # node + pnpm versions come from mise.toml
pnpm dev                       # app dev server (vite)
pnpm test                      # all workspace tests (engine golden+shimmed, app unit+render, oauth-worker)
pnpm typecheck                 # tsc across all packages, plus tools/ (the agent hooks)
pnpm lint                      # oxlint --type-aware + stylelint (zero tolerance: any report fails CI)
pnpm format                    # oxfmt (format:check to verify)
pnpm build                     # all packages
```

Targeted tests:

```bash
pnpm --filter @renovate-config-visualizer/engine test:golden    # real renovate modules, reference snapshots
pnpm --filter @renovate-config-visualizer/engine test:shimmed   # browser module graph, must match golden
pnpm --filter @renovate-config-visualizer/app test:unit         # pure-module unit tests (vitest "unit" project)
pnpm --filter @renovate-config-visualizer/app test:e2e          # playwright; requires `pnpm --filter …/app build` first
pnpm --filter @renovate-config-visualizer/app exec vitest run --project unit src/lib/share.test.ts   # single file
pnpm --filter @renovate-config-visualizer/app exec playwright test e2e/04-simulator.spec.ts          # single e2e
pnpm --filter @renovate-config-visualizer/app check:dev-graph   # guards `vite dev` module graph against Node-only leaks
```

## Session hooks

`.claude/settings.json` wires four hooks in `tools/agents/hooks/` (readme
there). They run as `node <file>.ts` and import nothing outside `node:`, since
two of them have to work before `pnpm install` has:

- **SessionStart / CwdChanged** — provision the checkout (`mise install`, then
  `pnpm install`); CwdChanged only fires the install for a root without
  `node_modules`, i.e. a fresh worktree.
- **PreToolUse** — denies `npm`/`npx`/`yarn`.
- **Stop** — runs lint, format:check, typecheck and the tests of every changed
  package, and blocks the stop with the failing output. **The e2e suite is
  excluded** (it needs a production build and takes minutes) — run it yourself
  when the change warrants it. A green run is fingerprinted, so an unchanged
  working set doesn't pay for the checks twice.

## Architecture

pnpm workspace with three packages:

- **`packages/engine`** — deep-imports the pinned `renovate` package (`renovate/dist/config/**`, all through one adapter module, `src/renovate-adapter.ts`) and records the pipeline trace. Renovate's config code is **not a public API**: the dependency is pinned exactly, and every Renovate bump PR runs full CI. `test/migration-drift.node.test.ts` catches upstream drift.
- **`packages/app`** — the React 19 SPA. `src/features/` (editor, presets, simulator) holds feature slices; `src/components/`, `src/hooks/`, `src/lib/` are shared. The engine is imported dynamically so the critical path stays small.
- **`packages/oauth-worker`** — stateless OAuth `code → token` exchange (a static site can't hold the `client_secret`). The handler is a pure function deployed both as a Cloudflare Worker (`wrangler`) and as a Node image (`server.mjs`). It must never see configs, presets, or API traffic.

### The shim system (the core trick)

`packages/engine/src/shims/vite-plugin-renovate-shims.ts` is a Vite `resolveId` plugin that swaps Renovate's Node-only internals (OpenTelemetry, bunyan, re2, datasource lookups, preset HTTP clients) for browser-safe shims in `src/shims/`. The logger shim doubles as the trace collector — preset-tree and provenance events **only exist in the shimmed module graph**. Preset fetching becomes plain `fetch()` against CORS-enabled host APIs. Shim matching is on path _suffix_ (survives pnpm's `.pnpm/...` real paths) via `resolveId`, not `resolve.alias`, because relative extensionless imports inside dist never hit aliases — the app's `vite.config.ts` copies the same mechanism for codemirror-json-schema.

### Test regimes

There are three module regimes, each with its own guard:

1. **Node / vitest** — engine `golden` project runs untouched Renovate modules and writes reference snapshots; the `shimmed` project runs the exact browser module graph (shim plugin + `server.deps.inline: [/renovate/]` — without the inline, Node loads `renovate/dist` natively and the plugin never sees it) and must produce **byte-identical** results. This is the proof the shims don't alter behavior.
2. **Production build** — Playwright e2e (`packages/app/e2e/`) drives the **production build via `vite preview`**, never `vite dev` (dev cold-starts can wedge the first engine import). Build the app first locally; CI reuses its build artifact.
3. **`vite dev`** — weakest CJS/ESM interop; `check:dev-graph` boots the dev server and fails on Node-only specifiers leaking into the graph.

The app's vitest config also has a `render` project (`src/**/*.test.tsx`, jsdom + shims) that counts panel re-renders while typing — a performance regression test, hence its long timeout.

## Enforced conventions (lint will fail otherwise)

- Nothing is advisory: `.oxlintrc.json` has no warn tier — every enabled rule is an error, and CI fails on any output.
- `react/jsx-max-depth` is 3 — it's a deliberate decomposition driver; extract components instead of nesting.
- No default exports (`import/no-default-export`), inline type imports, no `any`, no non-null assertions (the rare honest exception carries an inline disable stating its invariant).
- **CSS colors must go through `var()` design tokens** from the `:root` palette in `packages/app/src/index.css` — stylelint bans raw color literals and inline `light-dark()` on color-bearing properties (`color-mix()` of a token is the one allowed function shape).
- Formatting is oxfmt's job, not stylelint's or oxlint's.
- Conventional commit format.

## Other constraints worth knowing

- `matchCurrentVersion` uses Renovate's real versioning modules for every ecosystem **except `conda`** (its ~3 MB WASM parser is excluded; such clauses report an honest error).
- Share links carry state in the URL _fragment_ only (never reaches server logs) and must never carry tokens or manually injected presets. Tokens live in `sessionStorage`/memory only.
- `public/` is deployment payload copied verbatim, not app source; `rcv-config.js` there is a stub that the Docker entrypoint may overwrite at container start (runtime `RCV_*` config).
- CI must not install via mise hooks — the `postinstall` hook in `mise.toml` is local-only convenience (see the comment there before touching caching in workflows).
