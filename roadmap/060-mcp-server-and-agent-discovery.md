# 060 — `rcv mcp` + pointing agents at the headless interface

Milestone: M16 · Status: proposed

## Summary

Two closing moves from the
[2026-08 research](2026-08-agent-debug-interface-research.md): an MCP server
so interactive agent sessions get a warm engine and typed tools, and the
discovery surface that tells agents the headless interface exists at all.
The MCP server is `rcv mcp` — one stdio subcommand over 058's core, no new
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

- `rcv mcp`: stdio MCP server registered via
  `claude mcp add rcv -- pnpm dlx @renovate-config-debugger/cli mcp`.
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
