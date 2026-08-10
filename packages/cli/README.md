# `rcd` — the Renovate config debugger, headless

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
the file as written, no preset resolution. `rcd` is the debugger. Both run the
same pinned `renovate` package code, so they cannot disagree about semantics.

## Use

In this repository:

```console
$ pnpm --filter @renovate-config-debugger/cli rcd digest renovate.json
```

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
$ rcd simulate renovate.json --dep '{"depName":"react"}' --verdict matched --source repo
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

### `simulate` and `compare`

Both take the hypothetical update as `--dep <json>` (or `--dep-file`). Only the
fields you set are set — except the two name fields, which are cross-defaulted
the way Renovate's fetch worker does before packageRules run
(`dep.packageName ??= dep.depName`), so `--dep '{"depName":"react"}'` matches a
`matchPackageNames` rule instead of reporting it as `no-input`. The run's notes
say when a field was defaulted.

A `config:best-practices` config resolves to hundreds of rules, so `simulate`
scopes its pretty output:

| flag                                         | effect                                                        |
| -------------------------------------------- | ------------------------------------------------------------- |
| `--verdict notable` (pretty default)         | matched + unresolved — everything except a plain no-match     |
| `--verdict all\|matched\|no-input\|no-match` | one verdict; `no-input` is a rule that lost to an unset field |
| `--source repo\|presets\|all`                | which config level contributed the rule (default `all`)       |

Nothing is truncated silently: a filtered list ends with `N of M rules hidden
by … — `--verdict all --source all` shows every rule`. `--format json` keeps the
FULL `rules` array unless you pass one of the flags, and when you do it adds a
`ruleFilter` object with `total`/`shown`/`hidden`.

`compare` reports two axes, because they answer different questions:

- **behavior** — `noChange`, plus `behaviorOnlyInA`/`behaviorOnlyInB` and
  `configDelta`. This is the citable claim: the resulting per-dependency config
  is identical and no rule started or stopped doing something.
- **rule identity** — `rulesChanged` and `signatureChanges`. Removing an entry
  from the very array a rule matches on always rewrites that rule's selector
  text, so this goes true on edits that provably change nothing. It is reported,
  not headlined.

If either input config would be refused by Renovate, both commands exit `2` —
which says nothing about the simulation or the comparison. They now say so on
their own output (`exitNote` in JSON, a trailing `note:` line in pretty), so the
exit code never has to be guessed at.

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

## Read-only, on purpose

There is no `fix` or `migrate-file` verb. Agents edit configs with their own
tools and use `validate` (does it still pass?) and `compare` (did behavior
actually change?) as the oracle; `validate --format json` carries the suggested
fix and the fixed file text without applying anything.

## Design

`roadmap/058-rcd-debugger-cli.md` for the decisions, and
`roadmap/2026-08-agent-debug-interface-research.md` for the research and the
feasibility spike this package turns into a product.
