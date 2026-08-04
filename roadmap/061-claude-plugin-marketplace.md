# 061 — Claude plugin marketplace for the debugger

Milestone: M16 · Status: proposed

## Summary

060 leaves a gap between "the MCP server exists" and "an agent session has
it": the `claude-code-hint` marker is inert until an official-marketplace
listing exists, and a raw `claude mcp add` one-liner registers the server
but carries none of the know-how. Claude Code's plugin system closes both —
a **marketplace** is nothing more than a `.claude-plugin/marketplace.json`
in a git repository, and a **plugin** bundles the MCP server registration
together with a skill that teaches the debugging workflow. This item ships
both from this repository: `/plugin marketplace add
secustor/renovate-config-debugger`, then one install, and every later
session has the tools _and_ knows how to use them.

## User story

As a Claude Code user who wants my agent to debug Renovate configs, I want
to install one plugin instead of registering an MCP server by hand and
hoping the agent discovers the right call sequence, so that the session
starts with the tools and the workflow already in place.

## Scope

- `.claude-plugin/marketplace.json` at the repository root — marketplace
  name `renovate-config-debugger`, plugin sources as relative paths, so the
  catalog versions with the repo and an update is a push (users refresh via
  `/plugin marketplace update`).
- One plugin, `plugins/renovate-config-debugger/`:
  - `.claude-plugin/plugin.json` (name, description, version — the name
    matches 060's hint value, `renovate-config-debugger`).
  - MCP server config launching the published CLI:
    `pnpm dlx @renovate-config-debugger/cli mcp` (or `npx -y`), so the
    plugin itself contains no engine code and updates ride 059's releases.
  - A `skills/debug-renovate-config` skill encoding the workflow the
    research settled: `validate` first (exit codes as signal), `digest` for
    orientation, then drill down (`tree` / `provenance`), `simulate` +
    `compare` as the edit oracle — including the "preset-node bodies are
    large, query one node at a time" guidance, and falling back to the CLI
    (`--format json`) when the MCP server isn't available.
- README/docs: the marketplace add + install one-liners join the
  agent-facing section defined in 060; AGENTS.md points repo-internal
  agents at the same skill.
- Docs for the install-scope nuance: plugins install per user/project
  scope; the project-scope recommendation goes in the README.

## Decisions

- **The marketplace lives in this repo, not a separate one.** A dedicated
  marketplace repository is infrastructure with no second tenant in sight;
  in-repo, the plugin and the CLI it launches are versioned and reviewed
  together, and `/plugin marketplace add secustor/renovate-config-debugger`
  is the whole hosting story. If more plugins ever accumulate, extraction
  is mechanical (marketplace entries can point at other repos).
- **The plugin wraps the published CLI, never bundles it.** The plugin's
  MCP config shells out to `pnpm dlx @renovate-config-debugger/cli`; the
  plugin version can therefore lag the CLI's without breaking, and a
  Renovate bump (= CLI release, per 059) needs no marketplace change.
  Hard dependency: 059 must be published first.
- **A skill ships alongside the server, deliberately.** Tool schemas say
  what each tool takes, not when to call it; the skill carries the
  sequencing knowledge (validate → digest → drill down → compare) that the
  research doc otherwise leaves in prose no agent session reads. This is
  the "skills and plugins" half of discovery that 060's visible-docs
  surface can only link to, not inject.
- **The hint protocol stays as 060 states it.** Self-hosted marketplaces
  are invisible to `claude-code-hint` (official-marketplace-only), so the
  marker keeps pointing at a future `claude-plugins-official` listing; this
  marketplace is the working channel until then, and remains the channel
  for users who prefer explicit installs. Internal dev skills (019's
  persona replay) stay in-repo and out of the marketplace — they drive this
  project's own dev loop, not a consumer's.
