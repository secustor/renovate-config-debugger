# `rcd` — the Renovate config debugger, headless

## Experimental

**This CLI is experimental, and `0.x` means it.** Subcommands, flags and
output shapes may change in **any** `0.x` release — breaking changes land in
the minor, and a Renovate bump is itself a release, because the CLI's answers
change when Renovate's code does. What is stable underneath is the engine's
trace semantics, proven by the golden↔shimmed parity suite in
`packages/engine` — not the surface described below. Pin an exact version if
you script against it.

Licensed **AGPL-3.0-only**, like the rest of this project.

## Compatibility

Every release states the Renovate it carries: the engine and its `renovate`
graph are **inlined at build time**, so a given CLI version always answers with
exactly this Renovate — nothing resolves at install time.

<!-- compat-table -->

| `cli` | embedded `engine` | `renovate` |
| ----- | ----------------- | ---------- |
| 0.1.0 | 0.0.0             | 44.7.4     |

**The table describes an experimental interface**: a new row is not a promise
that the previous row's flags still work. (`packages/cli/scripts/check-compat.mjs`
fails the build if the top row does not describe the current build.)

## What it is

The same information the [web app](https://renovate.secustor.dev) renders, as
structured data: the preset tree with per-node bodies, per-key provenance, the
resolved-config document, the packageRules simulator, the A/B compare oracle
and translated validation errors — for the exact Renovate version this repo
pins.

It runs Renovate's own config code, in the **browser module graph, under
Node**. That is not an implementation detail: the preset tree and the
provenance events are reconstructed from Renovate's log stream by the engine's
logger shim, so a plain Node import of the engine returns
`presetTree: undefined` and no provenance at all. The bin boots Vite's SSR
module runner with `renovateShims()` active — the same plugin the browser
bundle and the engine's shimmed test suite use — so the CLI and the web app
cannot disagree.

Relation to upstream: `renovate-config-validator` is the linter — pass/fail on
the file as written, no preset resolution. `rcd` is the debugger. Both run the
same pinned `renovate` package code, so they cannot disagree about semantics.

## Use

Anywhere, with no checkout and no install step:

```console
$ pnpm dlx @renovate-config-debugger/cli validate renovate.json
$ npx -y @renovate-config-debugger/cli digest renovate.json
```

In this repository, `pnpm --filter @renovate-config-debugger/cli rcd …` runs
the same commands straight from `src/` (see [Two bins](#two-bins)).

```console
$ rcd digest renovate.json
✓ Renovate accepted this config. Your `config:recommended` entry expanded into
1,076 presets — only 7 of which set options, the rest are package-grouping
rules. Everything merged into 34 effective options, 6 of them overridden along
the way.

$ rcd validate renovate.json                       # exit 2 = Renovate refuses it
$ rcd tree renovate.json --node "config:best-practices" --body resolved
$ rcd provenance renovate.json labels
$ rcd resolved renovate.json --mode full
$ rcd simulate renovate.json --dep '{"depName":"react","currentValue":"17.0.0","newValue":"18.0.0"}'
$ rcd compare before.json after.json --dep '{"depName":"react"}'
$ rcd docs minimumReleaseAge
$ echo '{"extends":["config:recommended"]}' | rcd run --stdin --format json --select status
```

Every subcommand takes `--format pretty` (default, for humans) or
`--format json` (typed `TraceResult`/`SimulationResult` slices, for agents and
`jq`). `rcd --help` lists the commands; `rcd <command> --help` its flags.

### Input

A file path, `--stdin` (with `--file-name` for format detection), or
`--repo <owner/repo>` (`--platform`, `--endpoint`, `--ref`). The self-hosted
layers are `--global-config <file>` and `--inherited <file>`; a preset no
fetcher can reach can be supplied by hand with
`--inject 'github>org/repo=./preset.json'`.

### Exit codes

| code | meaning                                                              |
| ---- | -------------------------------------------------------------------- |
| `0`  | clean — Renovate accepted the config                                 |
| `2`  | **Renovate would refuse this config** (validation or parse failure)  |
| `1`  | infrastructure error — bad flag, unreadable file, unfetchable preset |

`2` is deliberate: Claude Code hooks treat exit 2 as the blocking "feed stderr
back to the model and fix it" signal, so `rcd validate` drops straight into a
Stop/PreToolUse hook with no wrapper.

### Credentials

Tokens come from the environment only — never from a flag, where they would
land in shell history and in every process listing:

| variable                                       | host    |
| ---------------------------------------------- | ------- |
| `RCD_GITHUB_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN` | GitHub  |
| `RCD_GITLAB_TOKEN`, `GITLAB_TOKEN`             | GitLab  |
| `RCD_GITEA_TOKEN`                              | Gitea   |
| `RCD_FORGEJO_TOKEN`                            | Forgejo |

The `npm` and `http` preset fetchers have no auth at all — same coverage, and
the same gaps, as the web app.

**Endpoint guard.** A preset fetcher sends a host's token to whatever endpoint
the platform context resolves to, and a `--global-config` sets that context. So
when the config under inspection chooses the endpoint, tokens are withheld and
the CLI says so on stderr. Pass `--platform-override` to impose your own
endpoint, or `--trust-endpoints` when the config is yours.

## MCP server

`rcd mcp` speaks MCP over stdio — the same answers as the subcommands, better
economics for a session. Point any MCP-capable client at it as a stdio server;
it takes no arguments and writes nothing but the protocol to stdout.

`run_config` resolves a config and returns a small summary plus a **runId**;
`get_final_config`, `get_preset_tree`, `get_preset_node`, `get_provenance`,
`get_resolved_config`, `simulate`, `compare_simulations`, `explain_message` and
`get_option_docs` all take that runId and query the HELD trace. That buys two
things a series of CLI invocations cannot give: the module graph and the
preset-fetch cache are paid once, and every answer describes the same run — two
separate `rcd` calls can silently describe different worlds if a remote preset
changed between them.

Worth knowing before your first call: **preset-node bodies are large — query
one node at a time.** The tool descriptions say so too.

The server holds a small number of recent runs (an LRU), so an agent can
compare the run before an edit with the run after it. A `runId` that has been
evicted says so, and lists the ones still held.

## Two bins

| bin               | what it runs                                     | who uses it                         |
| ----------------- | ------------------------------------------------ | ----------------------------------- |
| `bin/rcd.mjs`     | `dist/main.js` — the prebuilt bundle (published) | `pnpm dlx`, `npx`, a global install |
| `bin/rcd-dev.mjs` | `src/**` through Vite's SSR module runner        | in-repo development (`pnpm rcd`)    |

Both are the same module graph: the bundle is `vite build --ssr` of exactly
what the dev runner serves, with `renovateShims()` active and `renovate`
inlined, which is why the published package has no runtime dependencies. CI
proves it rather than asserting it — the engine's own shimmed snapshot suite
is re-run with the engine pointed at `dist/engine-surface.js`
(`pnpm --filter @renovate-config-debugger/cli test:bundle`), so the artifact
that ships has to reproduce the golden snapshots byte for byte.

## Read-only, on purpose

There is no `fix` or `migrate-file` verb. Agents edit configs with their own
tools and use `validate` (does it still pass?) and `compare` (did behavior
actually change?) as the oracle; `validate --format json` carries the suggested
fix and the fixed file text without applying anything.

## Design

`roadmap/058-rcd-debugger-cli.md` and `roadmap/059-publish-cli-package.md` for
the decisions, and
`roadmap/2026-08-agent-debug-interface-research.md` for the research and the
feasibility spike this package turns into a product.
