# `rcv` — the Renovate config debugger, headless

## Experimental

**This CLI is experimental.** Its subcommands, flags and output shapes may
change in any release while the interface finds its users. What is stable
underneath it is the engine's trace semantics, proven by the golden↔shimmed
parity suite in `packages/engine` — not the surface described below. Pin an
exact version if you script against it.

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
the file as written, no preset resolution. `rcv` is the debugger. Both run the
same pinned `renovate` package code, so they cannot disagree about semantics.

## Use

In this repository:

```console
$ pnpm --filter @renovate-config-debugger/cli rcv digest renovate.json
```

```console
$ rcv digest renovate.json
✓ Renovate accepted this config. Your `config:recommended` entry expanded into
1,076 presets — only 7 of which set options, the rest are package-grouping
rules. Everything merged into 34 effective options, 6 of them overridden along
the way.

$ rcv validate renovate.json                       # exit 2 = Renovate refuses it
$ rcv tree renovate.json --node "config:best-practices" --body resolved
$ rcv provenance renovate.json labels
$ rcv resolved renovate.json --mode full
$ rcv simulate renovate.json --dep '{"depName":"react","currentValue":"17.0.0","newValue":"18.0.0"}'
$ rcv compare before.json after.json --dep '{"depName":"react"}'
$ rcv docs minimumReleaseAge
$ echo '{"extends":["config:recommended"]}' | rcv run --stdin --format json --select status
```

Every subcommand takes `--format pretty` (default, for humans) or
`--format json` (typed `TraceResult`/`SimulationResult` slices, for agents and
`jq`). `rcv --help` lists the commands; `rcv <command> --help` its flags.

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
back to the model and fix it" signal, so `rcv validate` drops straight into a
Stop/PreToolUse hook with no wrapper.

### Credentials

Tokens come from the environment only — never from a flag, where they would
land in shell history and in every process listing:

| variable                                       | host    |
| ---------------------------------------------- | ------- |
| `RCV_GITHUB_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN` | GitHub  |
| `RCV_GITLAB_TOKEN`, `GITLAB_TOKEN`             | GitLab  |
| `RCV_GITEA_TOKEN`                              | Gitea   |
| `RCV_FORGEJO_TOKEN`                            | Forgejo |

The `npm` and `http` preset fetchers have no auth at all — same coverage, and
the same gaps, as the web app.

**Endpoint guard.** A preset fetcher sends a host's token to whatever endpoint
the platform context resolves to, and a `--global-config` sets that context. So
when the config under inspection chooses the endpoint, tokens are withheld and
the CLI says so on stderr. Pass `--platform-override` to impose your own
endpoint, or `--trust-endpoints` when the config is yours.

## Read-only, on purpose

There is no `fix` or `migrate-file` verb. Agents edit configs with their own
tools and use `validate` (does it still pass?) and `compare` (did behavior
actually change?) as the oracle; `validate --format json` carries the suggested
fix and the fixed file text without applying anything.

## Design

`roadmap/058-rcv-debugger-cli.md` for the decisions, and
`roadmap/2026-08-agent-debug-interface-research.md` for the research and the
feasibility spike this package turns into a product.
