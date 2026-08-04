# 059 — Publish the CLI as `@renovate-config-debugger/cli`

Milestone: M16 · Status: proposed

## Summary

058's `rcv` runs in-repo on Vite's dev-time SSR runner. That is the right
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
- **The dev runner stays.** In-repo, `pnpm rcv …` keeps using the SSR
  runner against `src/` — same code paths the app and tests use, no build
  step during development; the bundle is a packaging concern only.
