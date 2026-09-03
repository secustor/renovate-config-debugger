# Agents.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Compiler explorer for Renovate configs": a static React SPA that runs **Renovate's own config code in the browser** — parsing, migration, massaging, validation, preset resolution, merging, and a packageRules simulator — and renders the trace. Big-picture rationale: `docs/Architecture.md`. Per-feature design decisions: `roadmap/` (numbered docs, one per feature).

## Commands

```bash
mise install && pnpm install   # node + pnpm versions come from mise.toml
pnpm dev                       # app dev server (vite)
pnpm test                      # all workspace tests (engine golden+shimmed, app unit+components+shimmed, cli, oauth-worker)
pnpm typecheck                 # tsc across all packages, plus tools/ (the agent hooks)
pnpm lint                      # oxlint --type-aware + stylelint (zero tolerance: any report fails CI)
pnpm format                    # oxfmt (format:check to verify)
pnpm build                     # all packages
```

Targeted tests:

```bash
pnpm --filter @renovate-config-debugger/engine test:golden    # real renovate modules, reference snapshots
pnpm --filter @renovate-config-debugger/engine test:shimmed   # browser module graph, must match golden
pnpm --filter @renovate-config-debugger/app test:unit         # all three app vitest projects (unit + components + shimmed)
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

**In this checkout that server answers from the LAST PUBLISHED release**, not
from your working tree: `.mcp.json` resolves `rcd` through `npx`, and it has to
— it doubles as the published plugin's server config
(`.claude-plugin/plugin.json` names it), so it cannot point at a path inside
the repo. While you are changing `packages/cli/src` (or anything the CLI reads
— engine, or the app's `headless` derivations), the MCP answers describe the
released bundle instead of your edit. Two ways out:

```bash
# per developer: a local-scope entry that shadows .mcp.json's `rcd` for THIS
# project only (stored in ~/.claude.json under this project, never committed)
claude mcp add -s local rcd -- node packages/cli/bin/rcd-dev.mjs mcp
claude mcp remove -s local rcd   # back to the published bundle

# or per question, no config at all:
pnpm --filter @renovate-config-debugger/cli rcd digest renovate.json
```

MCP servers cannot be declared in `.claude/settings.json` or
`settings.local.json` — Claude Code reads server definitions only from
`.mcp.json` (project scope) and `~/.claude.json` (local/user scope) — which is
why the override is a command you run once rather than a file in the repo.
`bin/rcd-dev.mjs` is the same graph, served from `src/`, so an edit is live on
the next call with no build step.

The workflow those tools want — validate first, digest for orientation, drill
down one node at a time, `compare` as the oracle before proposing an edit — is
written down once, in `skills/debug-renovate-config/SKILL.md` (roadmap 061).
Read it when you are debugging a config here; it is the same skill the
published plugin ships to consumers.

**Read it by path.** The repo root's `skills/` is the PLUGIN's skill directory
(`.claude-plugin/plugin.json`), so in this checkout the skill auto-loads only
for someone who has the published plugin installed — it is not a project skill.
The two skill directories that ARE loaded here hold other things:
`.claude/skills/` has the persona-replay skill (roadmap 019) plus symlinks into
`.agents/skills/`, which is vendored third-party skills pinned by
`skills-lock.json` — neither is where this repo's own skill belongs. A developer
who wants it loaded in-checkout can symlink it
(`ln -s ../../skills/debug-renovate-config .claude/skills/`); nothing in the
repo does it for them, and the pointer above is why that is survivable.

A plain Node import of the engine is NOT equivalent — it silently has no preset
tree and no provenance at all. See Architecture below for why.

## Session hooks

`.claude/settings.json` wires four hooks in `tools/agents/hooks/` (readme
there). They run as `node <file>.ts` and import nothing outside `node:`, since
two of them have to work before `pnpm install` has:

- **SessionStart / CwdChanged** — provision the checkout (`mise install`, then
  `pnpm install`); CwdChanged only fires the install for a root without
  `node_modules`, i.e. a fresh worktree.
- **PreToolUse** — denies `npm`/`npx`/`yarn`.
- **Stop** — runs lint, format:check, typecheck, check:exports and the tests of
  every changed package, and blocks the stop with the failing output. **The e2e
  suite is excluded** (it needs a production build and takes minutes) — run it
  yourself when the change warrants it. A green run is fingerprinted, so an
  unchanged working set doesn't pay for the checks twice.

## Architecture

**The deep description lives in [`docs/Architecture.md`](docs/Architecture.md)** — the shim plugin's resolution mechanism, the golden/shimmed proof, the three module regimes and why each has the guard it has. Read it before changing anything about how Renovate's code is loaded. What you need to find your way around:

- **`packages/engine`** — deep-imports the pinned `renovate` package and records the pipeline trace. Two modules hold the whole `renovate/dist/**` surface: `src/renovate-adapter.ts` (engine code) and `src/shims/renovate-internals.ts` (the shims). Renovate's config code is **not a public API**: the dependency is pinned exactly, every bump PR runs full CI, and `test/migration-drift.node.test.ts` catches upstream drift.
- **`packages/app`** — the React 19 SPA. `src/features/` holds the feature slices (dependencies, editor, effective-config, overview, pipeline, presets, session, simulator), `src/app/` the shell, and `src/components/`, `src/hooks/`, `src/lib/`, `src/data/`, `src/platform/` the shared layers. Features never import `@/app` and never import each other (oxlint enforces it). The Renovate graph is reached only through the dynamic `loadEngine()` seam (`src/platform/engine-chunk.ts`); the engine's zero-import subpaths (`/is`, `/json`, `/contracts`, `/text-scan`) are imported statically, plus `/simulate-missing-inputs` from `lib/rule-verdict.ts`, which is Renovate-free rather than import-free — `.oxlintrc.json` bans a static value-import of the engine ROOT, pins `/schema` to `platform/editor-schema.ts`, and the `rcd/prefer-is-helpers` and `rcd/use-json-helpers` rules require `/is` and `/json` over hand-rolled copies.
- **`packages/cli`** — `rcd`, the headless debugger (roadmap 058/059/060, experimental): the browser module graph running under Node, one subcommand per question, plus `rcd mcp`. Its derivations are imported from the app through `@renovate-config-debugger/app/headless`, so its numbers are the app's numbers, not a copy.
- **`packages/oauth-worker`** — stateless OAuth `code → token` exchange (a static site can't hold the `client_secret`), deployed both as a Cloudflare Worker and as a Node image. It must never see configs, presets, or API traffic.

Two things to have in mind on any change here:

- The preset tree and the provenance events are emitted by the **logger shim**, so they exist **only in the shimmed module graph** — the browser bundle, the CLI, and the `shimmed` vitest projects, and nowhere else.
- Every project globs its files, and the app's three are assigned **by filename**: `src/**/*.test.ts` (unit) vs `src/**/*.test.tsx` (components, jsdom, no shims) vs `src/**/*.shimmed.test.tsx` (jsdom + shims, long timeout). The engine splits golden (`test/*.node.test.ts`) from shimmed (`test/*.shimmed.test.ts`) the same way, but its colocated `src/**/*.test.ts` glob is golden by location, so no infix works there: a `.shimmed.` name under `src/` still runs unshimmed. `test/project-coverage.node.test.ts` and `src/vitest-projects.test.ts` assert every test file matches exactly one project, so name a new file for the regime it needs. The e2e suite drives the **production build via `vite preview`**, never `vite dev`.

## Enforced conventions (lint will fail otherwise)

- Nothing is advisory: `.oxlintrc.json` has no warn tier — every enabled rule is an error, and CI fails on any output.
- `react/jsx-max-depth` is 3 — it's a deliberate decomposition driver; extract components instead of nesting.
- No default exports (`import/no-default-export`), inline type imports, no `any`, no non-null assertions (the rare honest exception carries an inline disable stating its invariant).
- **CSS colors must go through `var()` design tokens** from the `:root` palette in `packages/app/src/index.css` — stylelint bans raw color literals and inline `light-dark()` on color-bearing properties (`color-mix()` of a token is the one allowed function shape). `index.css` is the token block plus the element base; everything else is split into numbered files under `packages/app/src/styles/`, imported in order by `main.tsx` (the order is the cascade — see that file's header before adding one).
- Formatting is oxfmt's job, not stylelint's or oxlint's.
- Conventional commit format.

## Other constraints worth knowing

- `matchCurrentVersion` uses Renovate's real versioning modules for every ecosystem **except `conda`** (its ~3 MB WASM parser is excluded; such clauses report an honest error).
- Share links carry state in the URL _fragment_ only (never reaches server logs) and must never carry tokens or manually injected presets. Tokens live in `sessionStorage`/memory only — except the OAuth refresh token, which (roadmap 065, opt-in per deployment) lives in an `HttpOnly` cookie scoped to the oauth-worker; `localStorage` never holds a secret, only the non-secret cookie-session marker.
- `public/` is deployment payload copied verbatim, not app source; `rcd-config.js` there is a stub that the Docker entrypoint may overwrite at container start (runtime `RCD_*` config).
- CI must not install via mise hooks — the `postinstall` hook in `mise.toml` is local-only convenience (see the comment there before touching caching in workflows).
- **Never hand-edit a package `version`, or add a `renovateCompatibility` field to a manifest.** semantic-release owns both (roadmap 067): a release is a manual `workflow_dispatch` of `.github/workflows/release.yml`, which derives the version from the conventional commits since the last `v*` tag, stamps it into every non-`private` package, stamps the CLI's `renovateCompatibility` field (embedded versions, keyed by full package name) and renders the compat table into the README that ships to npm (the repo copy carries only markers), publishes, and writes the GitHub release. Nothing is committed back to main: versions live in tags, the changelog is the GitHub releases, and the compat history accumulates on the npm registry. All public packages share one version by construction. Write the commit message accordingly — `fix:`/`feat:` are what cut releases, `chore:`/`docs:`/`test:` are not.
