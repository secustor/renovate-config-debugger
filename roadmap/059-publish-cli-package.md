# 059 — Publish the CLI as `@renovate-config-debugger/cli`

Milestone: M16 · Status: done (2026-08-05) · Stability: **experimental**

The published package is explicitly experimental, and says so where a
consumer will look: the npm `description` leads with "Experimental", the
README's first section states that subcommands, flags and output shapes
may change in any `0.x` release, and the compat table carries the same
banner. The `0.x` version scheme below is the mechanical half of that
promise.

## Summary

058's `rcd` runs in-repo on Vite's dev-time SSR runner. That is the right
core, but agents outside this repository can't use it, and every invocation
pays the transform pipeline. This item packages the same module graph as a
prebuilt SSR bundle (`vite build`, shim plugin active, Node target) and
publishes it as `@renovate-config-debugger/cli`, so any agent anywhere can
run `pnpm dlx @renovate-config-debugger/cli validate renovate.json` —
sub-second startup, no checkout, no install step.

## User story

As an agent answering a Renovate config question in a repository that has
nothing to do with this project, I want `pnpm dlx @renovate-config-debugger/cli`
to resolve and explain the config, so that the debugger reaches the places
where configs actually live.

## Scope

- A `vite build` SSR configuration in `packages/cli` producing a plain Node
  ESM bundle with the engine (and its inlined `renovate` graph) baked in;
  the published bin dispatches to it instead of the dev runner.
- Package metadata mirroring 056: AGPL-3.0-only stated on the tin, exact
  `renovate` pin surfaced, compat table row per release
  (`cli` → `engine` → `renovate`).
- Publish workflow with npm provenance, sharing 056's registry organization
  (whichever lands first creates it).
- CI proof: the engine's shimmed snapshot suite re-run **against the
  bundle**, so "the bundle is the same graph" is tested, not assumed.
- README with the agent-facing one-liners (`pnpm dlx …`, and 060's
  `claude mcp add …` once it exists).

## Decisions

- **Bundle the engine; don't depend on the published engine package.** 056
  publishes `@renovate-config-debugger/engine` for programmatic consumers,
  but the CLI inlines its graph at build time instead of importing the
  package: the parity proof (shimmed snapshots vs. the bundle) must pin one
  exact artifact, and a resolvable dependency range would reintroduce the
  drift the pin exists to prevent. The compat table states which engine
  build each CLI release embeds.
- **Version scheme follows 056**: `0.x`, breaking changes in the minor, and
  a Renovate bump is a release — the CLI's answers change when Renovate's
  code does, and the version must say so.
- **The dev runner stays.** In-repo, `pnpm rcd …` keeps using the SSR
  runner against `src/` — same code paths the app and tests use, no build
  step during development; the bundle is a packaging concern only.

## As built (2026-08-05)

- **One Vite config, two modes.** `packages/cli/vite.config.ts` takes
  `({ command })` and differs in exactly one line: `ssr.noExternal` is
  `[/renovate/, /fast-json-patch/]` when serving and `true` when building.
  Serving cannot inline renovate's plain-CJS deps (they break the ESM module
  runner); a Rollup build has no such trouble, so the published package ends
  up with **no runtime dependencies at all** — one tarball, nothing resolved
  at install time. Measured: ~0.11 s for `rcv digest` against the bundle,
  versus ~0.85 s through the dev runner.
- **Two bins, one graph.** `bin/rcv.mjs` (published) imports `dist/main.js`;
  `bin/rcv-dev.mjs` (in-repo) boots the SSR runner. Both build the same
  process-facing object in `bin/io.mjs` — the graph is transformed with
  `define: { "process.env": "{}" }`, so a bin is the only place that can read
  the real environment.
- **The parity proof runs the engine's tests, not a copy of them.** A second
  build entry, `src/engine-surface.ts`, re-exports the engine API from the
  bundle; the `bundle` vitest project runs `packages/engine/test/*.shimmed.test.ts`
  with `../src/index` aliased to `dist/engine-surface.js`. The file snapshots
  and fixtures resolve relative to the test files, so the artifact that ships
  has to reproduce the golden snapshots byte for byte — 73 assertions. It runs
  in `ci.yml` (so a PR that breaks the bundle fails before a release tries to
  ship it) and again in the release workflow.
- **The compat table is checked, not trusted.** `scripts/check-compat.ts`
  runs as part of `build` and fails when the README table's top row does not
  match `packages/cli`'s version, `packages/engine`'s version and the exact
  `renovate` pin. A Renovate bump that forgets the table cannot publish.
- The AGPL text is copied into the package by the publish workflow rather than
  duplicated in the tree (`packages/cli/LICENSE` is gitignored).
- One bundled transitive dependency still imports `node:punycode`; the
  published bin filters that one deprecation warning off stderr — it is about
  code no consumer can change, and agents read stderr.

Not done here, deliberately: nothing was published, and no registry
organization was created. The first release needs the
`@renovate-config-debugger` scope to exist. 056 publishes the engine into the
same organization — whichever lands first creates it.

**Superseded in part by [067](067-semantic-release.md).** The hand-cut
`cli-v<version>` tag described here is gone: releases are one
`workflow_dispatch` run of semantic-release, tagged `v<version>` because the
version is now shared by every public package. `publish-cli.yml` was retired
into `release.yml`; the compat row above is stamped by the release rather than
added by hand; and the publish token this document assumed is gone too —
authentication is npm trusted publishing (OIDC), so the repository stores no
npm credential.
