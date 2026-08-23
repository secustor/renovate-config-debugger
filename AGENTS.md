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
pnpm --filter @renovate-config-debugger/engine test:golden    # real renovate modules, reference snapshots
pnpm --filter @renovate-config-debugger/engine test:shimmed   # browser module graph, must match golden
pnpm --filter @renovate-config-debugger/app test:unit         # pure-module unit tests (vitest "unit" project)
pnpm --filter @renovate-config-debugger/app test:e2e          # playwright; requires `pnpm --filter …/app build` first
pnpm --filter @renovate-config-debugger/app exec vitest run --project unit src/lib/share.test.ts   # single file
pnpm --filter @renovate-config-debugger/app exec playwright test e2e/04-simulator.spec.ts          # single e2e
pnpm --filter @renovate-config-debugger/app check:dev-graph   # guards `vite dev` module graph against Node-only leaks
```

## Debugging config resolution: use `rcd`

**Do not** write a throwaway `*.shimmed.test.ts` to poke the engine, and do not
drive the app in a browser, to answer a question about a config. `packages/cli`
(roadmap 058, experimental) hosts the same shimmed module graph under Node and
answers those questions directly:

```bash
alias rcd='pnpm --filter @renovate-config-debugger/cli rcd'
rcd digest renovate.json          # the whole run in one paragraph — start here
rcd validate renovate.json        # exit 2 = Renovate would refuse it
rcd tree renovate.json --node "config:best-practices" --body resolved
rcd provenance renovate.json labels
rcd simulate renovate.json --dep '{"depName":"react","currentValue":"17.0.0"}'
rcd compare before.json after.json --dep '{"depName":"react"}'   # the edit oracle
rcd group renovate.json --dep '{"depName":"a"}' --dep '{"depName":"b"}'  # would these updates group, and does the group form?
rcd docs minimumReleaseAge        # option semantics for the pinned Renovate
```

`--format json` on any subcommand for machine-readable output. Preset-node
bodies are large — query one node at a time. `packages/cli/README.md` has the
full surface, the credentials table and the endpoint guard.

For an interactive session, `rcd mcp` is the same answers as typed MCP tools
with a warm engine (roadmap 060) — `run_config` returns a `runId` and the
drill-down tools query that held run, so the whole session describes one
resolution instead of re-resolving per question:

```bash
claude mcp add rcd -- npx -y @renovate-config-debugger/cli mcp
```

(In Claude Code this checkout already registers the server: the repo root's
`.mcp.json` is the plugin's server config, and the project scope picks it up.)

The workflow those tools want — validate first, digest for orientation, drill
down one node at a time, `compare` as the oracle before proposing an edit — is
written down once, in `skills/debug-renovate-config/SKILL.md` (roadmap 061).
Read it when you are debugging a config here; it is the same skill the
published plugin ships to consumers.

A plain Node import of the engine is NOT equivalent: the preset tree and
provenance are reconstructed by the logger shim, so they exist only in the
shimmed graph — which the CLI, the browser bundle and the `shimmed` test
project all share.

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

pnpm workspace with four packages:

- **`packages/engine`** — deep-imports the pinned `renovate` package (`renovate/dist/config/**`, all through one adapter module, `src/renovate-adapter.ts`) and records the pipeline trace. Renovate's config code is **not a public API**: the dependency is pinned exactly, and every Renovate bump PR runs full CI. `test/migration-drift.node.test.ts` catches upstream drift.
- **`packages/app`** — the React 19 SPA. `src/features/` (editor, effective-config, overview, presets, session, simulator) holds feature slices; `src/components/`, `src/hooks/`, `src/lib/` are shared. The engine is imported dynamically so the critical path stays small.
- **`packages/cli`** — `rcd`, the headless debugger (roadmap 058, experimental). The bin boots Vite's SSR module runner with `renovateShims()` active, so the CLI is the browser module graph running under Node — one subcommand per question, `--format json` everywhere. It imports the app's DOM-free derivations through `@renovate-config-debugger/app/headless` (the run digest, preset-tree stats, the effective-config tally) so its numbers are the app's numbers, not a copy. Roadmap 059 added the published half: `vite build --ssr` bakes the same graph into a dependency-free Node bundle (`bin/rcd.mjs` → `dist/main.js`) for `pnpm dlx`, while `bin/rcd-dev.mjs` keeps serving `src/` in-repo — CI proves the two agree by re-running the engine's shimmed snapshot suite against the bundle.
- **`packages/oauth-worker`** — stateless OAuth `code → token` exchange (a static site can't hold the `client_secret`). The handler is a pure function deployed both as a Cloudflare Worker (`wrangler`) and as a Node image (`server.mjs`). It must never see configs, presets, or API traffic.

### The shim system (the core trick)

`packages/engine/src/shims/vite-plugin-renovate-shims.ts` is a Vite `resolveId` plugin that swaps Renovate's Node-only internals (OpenTelemetry, bunyan, re2, datasource lookups, preset HTTP clients) for browser-safe shims in `src/shims/`. The logger shim doubles as the trace collector — preset-tree and provenance events **only exist in the shimmed module graph**. Preset fetching becomes plain `fetch()` against CORS-enabled host APIs. Shim matching is on path _suffix_ (survives pnpm's `.pnpm/...` real paths) via `resolveId`, not `resolve.alias`, because relative extensionless imports inside dist never hit aliases — the app's `vite.config.ts` copies the same mechanism for codemirror-json-schema.

### Test regimes

There are three module regimes, each with its own guard:

1. **Node / vitest** — engine `golden` project runs untouched Renovate modules and writes reference snapshots; the `shimmed` project runs the exact browser module graph (shim plugin + `server.deps.inline: [/renovate/]` — without the inline, Node loads `renovate/dist` natively and the plugin never sees it) and must produce **byte-identical** results. This is the proof the shims don't alter behavior.
2. **Production build** — Playwright e2e (`packages/app/e2e/`) drives the **production build via `vite preview`**, never `vite dev` (dev cold-starts can wedge the first engine import). Build the app first locally; CI reuses its build artifact.
3. **`vite dev`** — weakest CJS/ESM interop; `check:dev-graph` boots the dev server and fails on Node-only specifiers leaking into the graph.

The app's vitest config splits its DOM tests in two, by filename: `components` (`src/**/*.test.tsx`, jsdom, **no** shims, default timeout) for ordinary component and hook tests, and `shimmed` (`src/**/*.shimmed.test.tsx`, jsdom + shims + inlined renovate, long timeout) for the few that run Renovate's own code — the keystroke re-render budget test and the panel tests that call `runPipeline` for real. `src/vitest-projects.test.ts` pins the convention so a test can't silently land in the wrong project.

## Enforced conventions (lint will fail otherwise)

- Nothing is advisory: `.oxlintrc.json` has no warn tier — every enabled rule is an error, and CI fails on any output.
- `react/jsx-max-depth` is 3 — it's a deliberate decomposition driver; extract components instead of nesting.
- No default exports (`import/no-default-export`), inline type imports, no `any`, no non-null assertions (the rare honest exception carries an inline disable stating its invariant).
- **CSS colors must go through `var()` design tokens** from the `:root` palette in `packages/app/src/index.css` — stylelint bans raw color literals and inline `light-dark()` on color-bearing properties (`color-mix()` of a token is the one allowed function shape).
- Formatting is oxfmt's job, not stylelint's or oxlint's.
- Conventional commit format.

## Other constraints worth knowing

- `matchCurrentVersion` uses Renovate's real versioning modules for every ecosystem **except `conda`** (its ~3 MB WASM parser is excluded; such clauses report an honest error).
- Share links carry state in the URL _fragment_ only (never reaches server logs) and must never carry tokens or manually injected presets. Tokens live in `sessionStorage`/memory only — except the OAuth refresh token, which (roadmap 065, opt-in per deployment) lives in an `HttpOnly` cookie scoped to the oauth-worker; `localStorage` never holds a secret, only the non-secret cookie-session marker.
- `public/` is deployment payload copied verbatim, not app source; `rcv-config.js` there is a stub that the Docker entrypoint may overwrite at container start (runtime `RCV_*` config).
- CI must not install via mise hooks — the `postinstall` hook in `mise.toml` is local-only convenience (see the comment there before touching caching in workflows).
- **Never hand-edit a package `version`, or add a `renovateCompatibility` field to a manifest.** semantic-release owns both (roadmap 067): a release is a manual `workflow_dispatch` of `.github/workflows/release.yml`, which derives the version from the conventional commits since the last `v*` tag, stamps it into every non-`private` package, stamps the CLI's `renovateCompatibility` field (embedded versions, keyed by full package name) and renders the compat table into the README that ships to npm (the repo copy carries only markers), publishes, and writes the GitHub release. Nothing is committed back to main: versions live in tags, the changelog is the GitHub releases, and the compat history accumulates on the npm registry. All public packages share one version by construction. Write the commit message accordingly — `fix:`/`feat:` are what cut releases, `chore:`/`docs:`/`test:` are not.
