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
| 0.1.0 | 0.0.0             | 44.4.6     |

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

## MCP server

`rcd mcp` speaks MCP over stdio — the same answers as the subcommands, better
economics for a session. Point any MCP-capable client at it as a stdio server;
it takes no arguments and writes nothing but the protocol to stdout.

`run_config` resolves a config and returns a small summary plus a **runId**;
`get_final_config`, `get_preset_tree`, `get_preset_node`, `get_provenance`,
`get_resolved_config`, `simulate`, `compare_simulations`, `explain_message` and
`get_option_docs` all take that runId and query the HELD trace. That buys two
things a series of CLI invocations cannot give: the module graph is paid once
per session — only the engine boot is amortized, since Renovate's own preset
`memCache` resets on every run, so a fresh `run_config` still fetches its
presets over the network — and every answer describes the same run — two
separate `rcd` calls can silently describe different worlds if a remote preset
changed between them.

The server speaks the 2026-07-28 protocol and the legacy 2025-era `initialize`
handshake, with the era chosen per connection, so older clients keep working
against the same process.

Worth knowing before your first call: **preset-node bodies are large — query
one node at a time.** The tool descriptions say so too. `simulate` takes the
same `verdict`/`source` scoping as `rcd simulate --verdict/--source` (see
[above](#simulate-and-compare)) — `source: "repo"` is the fix for a
`config:best-practices` run's several-hundred-rule list when the question is
about your own config's rules, not the presets it pulled in.

The server holds a small number of recent runs (an LRU), so an agent can
compare the run before an edit with the run after it. A `runId` that has been
evicted says so, and lists the ones still held.

Four properties the tools guarantee, because an agent cannot check them:

- **The default answer is the question you asked.** `simulate` returns the
  verdicts, `flattened` and `finalDependencyConfig`; the step-by-step merge
  trace (`mergeSteps`, `rawFinalConfig`) is ~1 MB on a `config:recommended` run
  and comes only with `detail: "full"`. `compare_simulations` leads with
  `summary`, the whole verdict in one line.

- **Every answer fits.** A tool result is capped at ~65 kB — derived from the
  host's own tool-output cap (~25k tokens), not chosen, because a bigger
  payload would be truncated by the host mid-JSON and the guarantee would be
  worth nothing. Over the cap the answer is elided _structurally_: the largest
  arrays keep a head window AND a tail window, and the omission is a
  `{ "truncated": true, "shown": …, "omitted": …, "omittedFrom": …, "items": [] }`
  object in place. The tail window is not decoration — a merged `packageRules`
  array is the presets' rules first and _your_ rules last. The top of the
  document names the parameter that narrows the question. Nothing is ever cut
  mid-JSON, and nothing is dropped silently. Small answers are indented for the
  transcript; large ones are compact, because indentation at that size is pure
  token overhead.
- **Unknown parameters are errors.** Every input schema is strict, including
  `dep` — `depname` is a validation error naming the key, not a simulation
  where no matcher had any input.
- **Credentials belong to one run.** Tool handlers run concurrently, so the
  credentials a run may use travel on that run's pipeline input and are
  installed inside the engine's serialized queue. A run whose global config
  chose the endpoint sends no token, whatever a concurrent trusted run is
  doing — and so does a run whose `endpoint` came in as a tool PARAMETER,
  because over MCP that value was written by the model, possibly out of the
  config it was asked to inspect. On this transport the opt-ins are the
  `platformOverride` and `trustEndpoints` parameters (the flags of the same
  name are the CLI's); only `trustEndpoints` vouches for an endpoint the caller
  supplied.

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
