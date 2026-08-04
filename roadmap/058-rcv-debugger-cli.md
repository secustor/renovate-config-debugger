# 058 — `rcv`: the debugger CLI on the shimmed engine

Milestone: M16 · Status: proposed

Derived from the
[2026-08 agent debug interface research](2026-08-agent-debug-interface-research.md),
whose feasibility spike this item turns into a package.

## Summary

Agents (Claude Code sessions, CI bots, the 019 persona skill) that need to
debug config resolution today either drive the web app in a browser — full
information, read through pixels — or import the engine in plain Node, which
is silently lossy: the preset tree and provenance are reconstructed from
Renovate's log stream by the logger shim, so they only exist in the shimmed
module graph. This item adds `packages/cli`: an `rcv` bin that hosts the
**browser module graph under Node** via Vite's SSR module runner with the
existing `renovateShims()` plugin, giving the terminal the same information
the web app renders — preset tree with per-node bodies, per-key provenance,
resolved-config document, simulator, A/B compare, translated validation
errors — as structured data.

## User story

As an agent (or a human in a terminal) debugging a Renovate config, I want
one command that resolves the config exactly as the visualizer does and
answers "what did `extends` expand into", "who set this key", and "would
this PR match", so that I don't have to drive a browser or trust a lossy
plain-Node import.

## Scope

- `packages/cli` workspace package, bin `rcv`, built on the spike's runner
  (Vite `createServer` + `ssrLoadModule`, `renovateShims()` active,
  `ssr.noExternal: [/renovate/, /fast-json-patch/]`, HMR off).
- Subcommands, one per question — `run`, `validate`, `digest`, `tree`,
  `provenance`, `resolved`, `simulate`, `compare`, `docs` — mapping 1:1 onto
  existing engine/app modules; no new resolution logic.
- `--format <pretty|json>` on every subcommand, defaulting to `pretty`;
  `--format json` emits the typed `TraceResult`/`SimulationResult` slices.
- Inputs: file path, stdin, or `--repo owner/repo` (via `fetchRepoConfig`);
  `--global-config`, `--inherited`, `--platform`/`--endpoint`/
  `--platform-override`, `--inject` for unreachable presets.
- Tokens from env only (`RCV_*_TOKEN`, falling back to `GITHUB_TOKEN`/
  `GH_TOKEN`/`GITLAB_TOKEN`), mapped onto `setPresetAuth`; endpoint guard as
  below.
- Exit codes: `0` clean, `2` Renovate would refuse the config, `1`
  infrastructure error.
- CLAUDE.md wires `rcv` in as the sanctioned way to debug resolution;
  hoist the effective-config tally derivation out of `EffectiveConfig.tsx`
  into `lib/` so digest/tally parity is import-level, not re-implemented.
- Tests: golden↔shimmed parity already proves the engine; the CLI adds
  its own thin tests for arg parsing, output shapes, and exit codes.

## Decisions

- **The shimmed graph, not plain Node.** Parity is the entire point: the
  preset tree and provenance only exist when the logger shim is the module
  graph's logger. The spike measured ~0.7 s engine import + ~0.8 s
  `runPipeline` for `config:recommended` (1,080 tree nodes) — acceptable for
  a debugger.
- **Subcommand per question, `--help` as the discovery surface.** Agents
  discover CLIs by reading help text; separate verbs with distinct output
  shapes beat one command with many flags.
- **`pretty` is the default format.** A human at a terminal gets the digest
  narrative; agents and pipelines opt into `--format json`.
- **Exit `2` = config refused, deliberately.** Claude Code hooks treat exit
  2 as the blocking "feed stderr back to the model and fix it" signal, so
  `rcv validate` drops straight into a Stop/PreToolUse hook with no wrapper.
  `1` stays infrastructure error.
- **Read-only.** No `fix`/`migrate-file` verbs: agents edit configs with
  their own tools and use `validate`/`compare` as the oracle; the engine's
  `applyFixToText` stays available through `validate` output rather than as
  a mutation command.
- **Endpoint guard carried over from the app.** Fetchers send the host token
  to whatever endpoint the platform context resolves to, so tokens are only
  attached to endpoints from explicit flags/env — never from the config file
  under inspection — unless `--trust-endpoints` is passed (the CLI's
  `suppressTokens`).
- **Relation to `renovate-config-validator`:** upstream is the linter —
  pass/fail on the file as written, no preset resolution. `rcv` is the
  debugger; both run the same pinned `renovate` code, so they cannot
  disagree about semantics.
