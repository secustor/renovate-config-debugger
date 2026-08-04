# 2026-08 — Agent debug interface research (CLI / MCP)

Status: research · Feasibility spike run 2026-08-04 (results below)

## Problem

Agents (Claude Code sessions, CI bots, the persona-replay skill) that need to
debug config resolution today have two bad options:

1. **Drive the web app in a browser** — full information, but slow (build +
   Playwright/extension round-trips), and the agent reads pixels/DOM instead
   of data.
2. **Import the engine in plain Node** — fast, but silently _lossy_: the
   preset tree and provenance events are reconstructed from Renovate's log
   stream by the **logger shim**, so they only exist in the shimmed module
   graph. A plain Node import of `renovate/dist` (the golden-test regime)
   returns `presetTree: undefined` and no provenance.

Goal: a first-class machine interface with **web-app parity** — the same
information the app renders, as structured data.

## Finding 1 — parity is one call surface, already headless

Everything the app shows comes from the engine's public exports
(`packages/engine/src/index.ts`), called from a handful of dynamic-import
sites (`packages/app/src/platform/run.ts` centralizes most of them):

| Web app feature                                           | Engine API                                                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Pipeline trace, stages, migration stepper                 | `runPipeline(PipelineInput) → TraceResult` (`events`, `stageStatus`, `finalConfig`, `errors`/`warnings`, `layerConfigs`) |
| Preset tree (fetched/afterParams/input/resolved per node) | `TraceResult.presetTree` — **shimmed graph only**                                                                        |
| Effective config + per-key provenance                     | `computeProvenance(result) → Map<string, KeyProvenance>`, `computeRuleProvenance(result)`                                |
| Resolved-config export                                    | `computeResolvedConfig(result, mode, { includeDefaults })`                                                               |
| Validation translations + quick fixes                     | `translateMessage`, `findMentionedOption`, `applyFixToText`                                                              |
| Simulator                                                 | `deriveUpdateType`, `simulatePackageRules({ config, dep }) → SimulationResult`                                           |
| A/B comparison                                            | `compareSimulations(a, b)`                                                                                               |
| Option docs / hovers                                      | `getOptionIndex()`                                                                                                       |
| Repo config loading                                       | `fetchRepoConfig`, `fetchRepoFile`                                                                                       |
| Auth (per-host tokens)                                    | `setPresetAuth(PresetAuth)`                                                                                              |

App-side derivations that add information beyond the engine are all **pure,
DOM-free modules** a CLI could import or mirror: preset-tree stats
(`components/preset-tree-stats.ts` — counts, zero-contribution flags, tree
summary), the run digest (`lib/run-digest.ts` — the plain-English overview
sentence), simulator verdict threads (`features/simulator/verdict-threads.ts`),
layer match counts, and the effective-config overridden/appended/merged
tallies (computed in `EffectiveConfig.tsx` from `KeyProvenance` chains — the
only one currently trapped inside a component). Parity therefore does not
require touching the React layer; at most it argues for hoisting one or two
derivations into `lib/`.

## Finding 2 — the shimmed graph already runs under Node

The vitest `shimmed` project _is_ the browser module graph running in Node:
the `renovateShims()` Vite plugin plus `server.deps.inline: [/renovate/]`
(`packages/engine/vitest.config.ts`). Preset fetching in the shims is plain
`fetch()`, which Node ≥18 has natively — so a Node CLI gets **live** preset
resolution (github/gitlab/gitea/forgejo/http/npm) with tokens via
`setPresetAuth`, no CORS involved.

### Feasibility spike (run 2026-08-04, Node 26, Vite 8)

A ~50-line script loaded the engine through Vite's SSR module runner with the
shim plugin active and ran the real pipeline:

```js
import { createServer } from "vite";
// bootstrap server only to load the TS plugin itself
const boot = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true, hmr: false },
});
const { renovateShims } = await boot.ssrLoadModule("/src/shims/vite-plugin-renovate-shims.ts");
await boot.close();
const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  plugins: [renovateShims()],
  ssr: { noExternal: [/renovate/, /fast-json-patch/] },
  server: { middlewareMode: true, hmr: false },
});
const engine = await server.ssrLoadModule("/src/index.ts");
const result = await engine.runPipeline({ fileName: "renovate.json", content });
```

Results for `{ extends: ["config:recommended", ":dependencyDashboard"] }`:

- engine import **~0.7 s**, `runPipeline` **~0.8 s** (uncached transforms)
- `presetTree` **populated, 1,080 nodes** — full web-app parity
- `computeProvenance` works (returns a `Map`)
- all stages report the same statuses as the app

Gotchas found (each one line of config): Vite's HMR websocket must be off
(`hmr: false`); `ssr.noExternal` must inline `renovate` **and**
`fast-json-patch` (its CJS exports aren't statically analyzable) but _not_
everything — inlining renovate's plain-CJS deps (`parse-link-header`) breaks
the ESM runner, and Node's native CJS interop handles them fine externalized.
The two-server bootstrap exists only because the plugin itself is TS; Node
26's native type-stripping could likely import it directly and drop the first
server.

## Options

### A. `rcv` CLI on the Vite SSR runner — recommended core

A new workspace package (`packages/cli`) exposing a `rcv` bin that boots the
spike's runner once and dispatches subcommands. Dev-time startup (~1.5 s cold)
is fine for debugging. It reuses the _exact_ plugin the browser bundle and the
shimmed tests use, so parity is enforced by construction — and the existing
golden↔shimmed snapshot proof extends to it for free.

Sketch of the command surface. Every subcommand takes
`--format <pretty|json>`, defaulting to `pretty` (human/digest-style text);
`--format json` emits the typed slices of `TraceResult`/`SimulationResult`
for agents and `jq`:

```
rcv run <file> [--global-config g.json] [--inherited i.json]
               [--platform gitlab --endpoint … --platform-override]
               [--inject 'github>org/repo=./local-preset.json']
               [--select events|tree|final|status]     # trim the firehose
rcv tree <file> [--node <name> --body resolved]  # structure+stats; bodies per node
rcv provenance <file> [key]
rcv resolved <file> [--mode …] [--include-defaults]
rcv validate <file>        # errors/warnings + translations + quick fixes
rcv simulate <file> --dep '{"depName":"react","currentValue":"17.0.0",…}'
rcv compare …              # two simulate runs → SimulationComparison
rcv digest <file>          # the Overview sentence (reuse app's run-digest.ts)
rcv docs <option>          # OptionIndex lookup
```

What a session looks like:

```console
$ rcv digest renovate.json
✓ Renovate accepted this config. It rewrote `semanticCommits` in your file.
Your `config:recommended` entry expanded into 1,076 presets — 7 of which set
options, the rest are package-grouping rules. …

$ rcv run renovate.json --format json --select status
{"stageStatus":{"parse":"ok","migrate":"ok",…},"errors":[],"warnings":[…]}

$ rcv tree renovate.json --node "helpers:pinGitHubActionDigests" --body resolved
$ echo '{"extends":["config:recommended"]}' | rcv run --stdin --file-name renovate.json
```

Inputs: file path or stdin; `--repo owner/repo` via `fetchRepoConfig`. Tokens
**only** from env (see the auth section). **Exit codes as signal**: `0`
clean, `2` Renovate would refuse the config (validation errors), `1`
infrastructure error (bad flags, unfetchable preset) — `2` for the
config-refused case deliberately, because Claude Code hooks treat exit 2 as
the blocking "feed stderr back to the model and fix it" signal, so
`rcv validate` drops straight into a Stop/PreToolUse hook without a wrapper.
Output size needs care: a
full `TraceResult` for `config:recommended` embeds 1,080 nodes with four
config bodies each — hence `--select`, and tree output defaults to
structure+stats with bodies behind a per-node query.

#### Why these subcommands

One subcommand per _question an agent asks_ — mirroring the app's tabs — not
one per engine function; separate verbs beat flags because `--help` is the
agent's primary discovery surface, and the projections differ in output
shape, defaults, and arguments. Each maps onto an existing module, so none
adds resolution logic:

- `run` — the superset; raw `TraceResult` slices for when the agent really
  wants events/stage ordering. Everything else is `run` + a projection.
- `validate` — "would Renovate accept this?" The most automatable question,
  plus 014's translations and quick fixes; the one with hook-grade exit
  codes, so it's what CI and Stop hooks call.
- `digest` — 029's overview sentence: the cheapest orientation before
  deciding what to drill into, same role it plays on the Overview tab.
- `tree` — "what did `extends` expand into, and what did preset X
  contribute?" (002/011). Structure+stats by default; bodies per node.
- `provenance` — "who set this key, and who overrode whom?" (005/013) — the
  question behind most real debugging sessions.
- `resolved` — "give me the equivalent config with no external references"
  (051); useful as agent _output_ when proposing a de-preset-ified config.
- `simulate` — "would this PR be grouped/labeled/blocked here?" (006);
  verdict per rule with clause-level evidence.
- `compare` — 018's A/B oracle: the tool that lets an agent _prove_ a
  proposed edit changes (or doesn't change) behavior before opening a PR.
- `docs` — `getOptionIndex()` lookup (003): stops agents hallucinating
  option semantics, correct for the exact pinned Renovate version.
- `mcp` — the stdio server as a subcommand, so there is exactly one entry
  point to install, document, and hint at.

Deliberately absent: `login` (OAuth deferred), a `repo` verb (repo loading
is an input — `--repo` on any subcommand — not a question), and anything
write-shaped like `fix`: the debugger starts read-only; agents edit configs
with their own tools and use `validate`/`compare` as the oracle.

#### Why not upstream `renovate-config-validator`?

Renovate ships `renovate-config-validator`, and for the pass/fail question
it is the authoritative answer — but it answers _only_ that question, and
only as human-readable log lines. It parses, migrates and schema-validates
the file; it does **not** resolve presets, so any question about what
`extends` pulls in, what the effective config is, or where a value came
from is out of its scope. The nearest upstream alternative for those,
`renovate --dry-run`, needs a real repository, platform credentials and a
full bot run, and emits logs rather than data. What `rcv` adds is exactly
the visualizer's reason to exist, headless: the preset tree with per-node
bodies, per-key provenance, the resolved-config document, the packageRules
simulator and the A/B compare oracle, error translations with quick fixes,
and `--format json` everywhere. Even the overlapping `rcv validate` sees
more than the file as written: the run continues through preset resolution,
so unresolvable or erroring presets surface too — plus translations, quick
fixes, structured output and hook-grade exit codes. The honest framing:
`renovate-config-validator` is the linter; `rcv` is the debugger — and
because both run the same pinned `renovate` package code, they cannot
disagree about semantics.

### B. Prebuilt SSR bundle → `npx`-able package

`vite build` (SSR target, shim plugin active) producing a plain Node bundle:
sub-second startup and, more importantly, **publishable** under the
`@renovate-config-debugger/` scope — agents anywhere could
`pnpm dlx @renovate-config-debugger/cli run renovate.json` without this
repo. Cost: a second build artifact whose graph must be proven identical
(run the shimmed snapshot tests against the bundle in CI). Sensible as phase
2 packaging of A, not a separate design.

### C. MCP server

Same package, one extra subcommand speaking MCP over stdio, registered once:

```console
$ claude mcp add rcv -- pnpm dlx @renovate-config-debugger/cli mcp
```

It wraps A's core 1:1 — same commands, zero extra functionality — so its
justification is purely interaction economics:

1. **Warm engine** — the module-graph boot and the preset-fetch cache are
   paid once per session; every later call is milliseconds. An agent
   iterating on a config ("change this, re-run, compare") gets a tight
   loop, where the one-shot CLI pays a boot _and a fresh round of preset
   API fetches (rate limits included)_ per invocation.
2. **Run handles instead of firehose output** — `run_config` returns a small
   summary plus a `runId`; the trace stays in server memory (small LRU of
   recent runs) and drill-down tools query it. Beyond size, this buys
   **consistency**: `rcv tree` then `rcv provenance` are two pipeline runs
   that can silently describe different worlds if a remote preset changed
   in between; two `{runId}` lookups describe the same run. This is the web
   app's progressive disclosure, as tool calls:

```
run_config({fileName, content, globalConfig?, inheritedConfig?, platform?, endpoint?})
  → {runId, digest, stageStatus, errors, warnings, treeSummary}
get_final_config({runId})
get_preset_tree({runId, depth?, query?})      # structure + stats, no bodies
get_preset_node({runId, node, body?})         # fetched/afterParams/input/resolved
get_provenance({runId, key?})
get_resolved_config({runId, mode?, includeDefaults?})
simulate({runId, dep})
compare_simulations({runId, depA…} | {simA, simB})
explain_message({message})                    # translation + quick fix
get_option_docs({name})
```

Tool descriptions should carry the domain hints agents otherwise learn the
hard way ("preset-node bodies are large — query one node at a time").

Three further advantages over shelling out to the CLI:

- **Typed tools, not flag archaeology** — MCP tools carry JSON schemas and
  descriptions injected into the agent's context: no `--help` parsing, no
  malformed flags, structured results with no stdout/stderr interleaving.
- **Reach beyond the shell** — works in every MCP client, including
  environments where agents have no Bash tool (claude.ai, restricted
  enterprise setups, other vendors' agents); registered once, present in
  every later session.
- **Permission granularity** — `mcp__rcv__simulate` can be allowlisted as a
  specific read-only tool, where CLI calls arrive through coarse generic
  Bash permissions.

The honest counterweight: for one-shot questions from an agent that _has_ a
shell ("is this config valid?"), the CLI is strictly simpler — no resident
process, composable with `jq`, works in CI. Hence: build after A, as a `rcv
mcp` subcommand rather than a separate package — the CLI stays the universal
least-common-denominator, the MCP server is strictly better for interactive
debugging sessions.

### D/E. Status quo (rejected as the answer, kept as escape hatches)

Browser automation stays for UI testing (persona skill, e2e). Writing a
throwaway `*.shimmed.test.ts` remains the zero-infrastructure way to poke the
engine today — worth documenting in CLAUDE.md until the CLI exists.

## Auth for hosted presets

The CLI rides the exact same auth layer the app uses — the engine's flat
`PresetAuth` object (`setPresetAuth`, `packages/engine/src/auth.ts`), which
each preset-fetcher shim reads for its own host: GitHub `Authorization:
Bearer`, GitLab `PRIVATE-TOKEN`, Gitea/Forgejo `Authorization: token`. The
`npm`/`http` fetchers have no auth at all, so the CLI has identical coverage
and identical gaps as the web app (public npm/http presets only). No engine
changes needed; the CLI populates `PresetAuth` before `runPipeline`.

Token sources, in order:

1. **Environment variables** (primary — agents/CI already have them):
   `RCV_GITHUB_TOKEN`/`RCV_GITLAB_TOKEN`/… mapped onto `PresetAuth`, falling
   back to the ambient conventions (`GITHUB_TOKEN`/`GH_TOKEN`,
   `GITLAB_TOKEN`, arguably `RENOVATE_TOKEN`). Never accepted as argv flags
   (shell history / process lists).
2. **Ambient credential helpers** — opportunistic `gh auth token` (and
   equivalents) when the env var is absent.

OAuth is deliberately **out of scope for now**: the oauth-worker exists only
because a static SPA can't hold the `client_secret`, a constraint the CLI
doesn't have — env vars cover the agent use case entirely.

The one design decision to carry over is the app's `suppressTokens` guard:
the fetchers send the host token to whatever endpoint the platform context
resolves to, so running `rcv` against an _untrusted_ config whose global
config sets `endpoint: https://evil.example` would leak the token there. The
CLI must mirror the guard — only attach tokens to endpoints that came from
explicit flags/env, not from the config file under inspection, unless the
user opts in (e.g. `--trust-endpoints`). And, as everywhere else in this
project: tokens never appear in output (`TraceResult` doesn't contain them —
a rule to keep, not work to do).

## Pointing agents that reach the web app at the CLI

Researched (web, 2026-08): there is **no shipped machine-readable mechanism**
by which an agent landing on a website discovers a companion CLI/MCP server.
What was checked, and the verdicts:

- **llms.txt** — spec exists (llmstxt.org), adoption is real but shallow, and
  the major crawlers/agents demonstrably don't fetch it unprompted (Google
  compared it to the meta-keywords tag; a 500M-request bot-traffic audit found
  ~400 hits). Coding agents _do_ fetch a known library's llms.txt on demand,
  so it's a docs shortcut, not a discovery channel. Cheap to add to `public/`
  with a "use the CLI" pointer; expect little from it.
- **`.well-known` discovery** (MCP "Server Cards", `/.well-known/mcp/…`,
  agents.json) — still Draft SEPs, consumed by no shipping client. OpenAI's
  `ai-plugin.json` is dead. The only _real_ `.well-known` machinery in MCP is
  OAuth bootstrap (RFC 9728) for a server whose URL the client already has —
  auth, not discovery. Skip for now.
- **Hidden in-page hints** (off-screen text, `aria-hidden`, meta tags aimed at
  agents) — actively harmful: hidden agent-directed instructions are the
  canonical indirect-prompt-injection pattern (OWASP LLM01), agents
  increasingly discount off-screen text, and browser-driving agents read the
  **accessibility tree**, which strips hidden elements anyway.
- **What actually works** (the pattern Stripe/GitHub/Linear/Supabase all use):
  plain developer docs. A **visible** note in the app (footer/help,
  `<aside role="note">`: "Agents/scripts: this trace is available headlessly —
  `pnpm dlx …` / `claude mcp add …`"), a README/docs section with the exact
  copy-pasteable one-liner, and registry listings (npm, MCP registry). MCP
  discovery today is human/config-mediated: a developer (or an agent reading
  the README) runs `claude mcp add rcv -- npx -y @renovate-config-debugger/cli mcp`
  once, and every later session has the tool.
- **Claude Code plugin hints** — the one shipped in-band mechanism: when the
  CLI detects it is running inside Claude Code (`CLAUDECODE=1` in the env),
  it prints a one-line marker to stderr —
  `<claude-code-hint v="1" type="plugin" value="renovate-config-debugger@claude-plugins-official" />`
  — which Claude Code strips from the output (never reaches the model) and
  turns into a one-time "install this plugin?" prompt for the user. Emit it
  from `--help`, unknown-subcommand errors, and first run; deduplicated per
  plugin, so over-emitting is harmless. Caveat: the prompt only fires for
  plugins listed in the **official Anthropic marketplace**
  (`claude-plugins-official`) — hints naming local/community marketplaces are
  silently dropped. Emitting is still worth doing from day one (cheap,
  forward-compatible); until a listing exists, a companion plugin/skill is
  installed manually from this repo and README/AGENTS.md remain the channel.
- **AGENTS.md / CLAUDE.md** — for agents working _in this repo_, the repo doc
  is the discovery channel that is guaranteed to be read; the deployed site
  only needs to catch agents who arrived without repo context.

So: a visible in-app note + README one-liner (backed by the published package
of Option B and the MCP entry of Option C) is the whole mechanism; llms.txt in
`public/` is an optional garnish; everything else is not ready or
counterproductive.

## Recommendation

1. **Phase 1** — `packages/cli` with the Vite-runner core and the subcommands
   above; hoist the effective-config tally derivation out of
   `EffectiveConfig.tsx` so digest/tally parity is import-level. Wire
   `rcv` into CLAUDE.md as the sanctioned debug path.
2. **Phase 2** — SSR-bundle build + npm publish as
   `@renovate-config-debugger/cli` for `pnpm dlx` use outside the repo; CI
   job runs the shimmed snapshot suite against the bundle.
3. **Phase 3** — `rcv mcp` stdio server, plus the discovery surface: visible
   in-app "for agents/scripts" note with the install one-liner, README/docs
   section, the `claude-code-hint` stderr marker, optional `public/llms.txt`.
