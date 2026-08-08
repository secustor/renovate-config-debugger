# 060 — `rcd mcp` + pointing agents at the headless interface

Milestone: M16 · Status: done (2026-08-05)

## Summary

Two closing moves from the
[2026-08 research](2026-08-agent-debug-interface-research.md): an MCP server
so interactive agent sessions get a warm engine and typed tools, and the
discovery surface that tells agents the headless interface exists at all.
The MCP server is `rcd mcp` — one stdio subcommand over 058's core, no new
functionality, purely better interaction economics. Discovery is
deliberately boring: the mechanisms that were researched and rejected
(hidden in-page hints, `.well-known` manifests, llms.txt-as-signal) are
documented in the research doc; what ships is visible documentation plus the
one shipped in-band protocol, Claude Code's plugin hint marker.

## User story

As an agent iterating on a config in an MCP-capable client, I want
`run_config` once and cheap drill-down calls afterwards, so that an
edit-run-compare loop doesn't pay a boot and a full round of preset fetches
per question — and as an agent that only knows the web app, I want to find
out that this exists.

## Scope

- `rcd mcp`: stdio MCP server registered via
  `claude mcp add rcd -- pnpm dlx @renovate-config-debugger/cli mcp`.
- Tool surface mirroring the subcommands: `run_config` returning
  `{runId, digest, stageStatus, errors, warnings, treeSummary}`, then
  `get_final_config` / `get_preset_tree` / `get_preset_node` /
  `get_provenance` / `get_resolved_config` / `simulate` /
  `compare_simulations` / `explain_message` / `get_option_docs` against a
  small LRU of held runs.
- Tool descriptions carry the domain hints agents otherwise learn the hard
  way ("preset-node bodies are large — query one node at a time").
- Discovery surface: a visible "for agents/scripts" note in the app
  (semantic HTML, in-flow — never hidden text), a README/docs section with
  the exact one-liners, the `claude-code-hint` stderr marker emitted by the
  CLI when `CLAUDECODE=1` (from `--help`, unknown-subcommand errors, first
  run), and an optional `public/llms.txt`.

## Decisions

- **Handles over payloads.** A full trace for `config:recommended` is 1,080
  nodes × four bodies; `runId` + drill-down is the web app's progressive
  disclosure as tool calls. It also buys run consistency: two CLI
  invocations can describe different worlds if a remote preset changed
  between them; two `{runId}` lookups cannot.
- **A subcommand, not a second package.** The CLI stays the universal
  least-common-denominator (shell, CI, `jq`); the server is strictly better
  only for sessions, and one entry point is one thing to install, document
  and hint at.
- **No hidden agent messaging, ever.** Off-screen instructions to agents are
  the canonical indirect-prompt-injection pattern; this project's discovery
  is all visible text a human can read too.
- **Plugin hint emitted from day one, expectations set accordingly.** Claude
  Code only prompts for plugins in the official Anthropic marketplace; until
  a listing exists the marker is inert but forward-compatible, and
  README/AGENTS.md remain the working channel.

## As built — the MCP server (2026-08-05)

- **The tools are the CLI's projections, not a second implementation.** 058's
  command modules were refactored first: `src/projections/{digest,tree,
provenance,messages}.ts` now hold the shapes, and the subcommands and the
  MCP tools both import them. So "no new functionality" is structural — a
  change to what `get_preset_tree` answers is a change to what `rcv tree`
  answers.
- Same for credentials: `applyRunAuth` (with the endpoint guard inside it) is
  shared, so the guard cannot be enforced on one transport and forgotten on
  the other. `run_config` takes `trustEndpoints` for the same opt-in the CLI
  spells `--trust-endpoints`.
- **`RunStore` is a real LRU** (8 runs): a `get` refreshes recency, so the run
  an agent keeps drilling into is never the one evicted next, and an expired
  handle is reported with the ids still held rather than a bare miss. Holding
  more than one run is what makes `compare_simulations` an edit oracle across
  two runs.
- Tested through a real MCP client over the SDK's in-memory transport pair
  (`test/mcp.test.ts`), so schemas, handlers and result shapes are exercised
  the way a client exercises them; `rcv mcp` was additionally smoke-tested
  over stdio against the built bundle.
- **Nothing is written to stdout by `rcv mcp`** — on a stdio transport stdout
  IS the protocol. Diagnostics go to stderr, which is also what keeps them out
  of a `--format json` document.

## As built — discovery (2026-08-05)

- The hint fires at most once per process (it matters for `rcv mcp`, which
  lives for a whole session) from the three moments the doc names: `--help`,
  an unknown subcommand, and the first run. It is stderr-only, so it can
  corrupt neither the MCP protocol stream nor a `--format json` document.
- Discovery, as shipped: `packages/app/src/components/HeadlessNote.tsx` (a
  visible `<footer>` at the end of the page, in flow, with the copy-pasteable
  one-liners), a "For agents and scripts" section in the root README, an MCP
  section in the CLI README, the AGENTS.md pointer, and
  `packages/app/public/llms.txt`.

Left open: nothing here can be _verified_ end to end until 059's package is
actually published — every one-liner names `pnpm dlx
@renovate-config-debugger/cli`. The plugin hint stays inert until an
official-marketplace listing exists (061 ships the plugin itself and a
self-hosted marketplace, which the hint protocol deliberately cannot see).
