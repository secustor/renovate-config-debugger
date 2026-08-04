# `renovate-config-debugger` — Claude Code plugin

Registers the [`rcd` MCP server](../../packages/cli) and ships the skill that
knows how to use it: resolve a Renovate config with Renovate's own code, and
answer "what did `extends` pull in", "who set this option", "would Renovate
accept this", "does my edit change which packageRules fire".

> **Experimental.** The CLI it wraps is `0.x`: tool names, flags and output
> shapes may change in any release.

## Install

```
/plugin marketplace add secustor/claude-plugins
/plugin install renovate-config-debugger@claude-plugins
```

Plugins install per **user** or per **project** scope. Prefer project scope for
a repository whose Renovate config people actually debug — the plugin then
travels with the checkout, and a teammate's session has the same tools and the
same workflow without a personal setup step. User scope is right when you debug
Renovate configs across many repositories.

## What it contains

| part                           | what it does                                                              |
| ------------------------------ | ------------------------------------------------------------------------- |
| `.mcp.json`                    | launches `pnpm dlx @renovate-config-debugger/cli mcp`                     |
| `skills/debug-renovate-config` | the workflow: validate → digest → drill down → compare as the edit oracle |

The plugin contains **no engine code**. It shells out to the published CLI, so
updates ride that package's releases (including a Renovate bump, which is a
release of its own) and the plugin version can lag without breaking.

If `pnpm` is not on your machine, change `.mcp.json`'s command to
`npx` with args `["-y", "@renovate-config-debugger/cli", "mcp"]` — same
package, same server.

## Why a skill and not just the server

Tool schemas say what each tool takes, not when to call it. The sequencing —
`run_config` first and reuse its `runId`, read the digest before pulling
anything large, query preset-node bodies one node at a time, and prove an edit
with `compare_simulations` rather than by reading it — is knowledge that would
otherwise live in prose no session reads.

## Design

`roadmap/061-claude-plugin-marketplace.md` in this repository, and
`roadmap/2026-08-agent-debug-interface-research.md` for why the discovery
surface looks the way it does.
