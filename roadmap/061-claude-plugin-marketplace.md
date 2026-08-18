# 061 — Claude plugin marketplace for the debugger

Milestone: M16 · Status: done (2026-08-05) — in-repo half; the catalog
repository is the remaining follow-up (see "As built")

## Summary

060 leaves a gap between "the MCP server exists" and "an agent session has
it": the `claude-code-hint` marker is inert until an official-marketplace
listing exists, and a raw `claude mcp add` one-liner registers the server
but carries none of the know-how. Claude Code's plugin system closes both —
a **marketplace** is a `.claude-plugin/marketplace.json` in a git
repository, and a **plugin** bundles the MCP server registration together
with a skill that teaches the debugging workflow. This item splits the two
across the right repos: a thin **`secustor/claude-plugins`** catalog
repository holding only the marketplace manifest, whose entry points back
at the plugin directory maintained _here_, next to the CLI it describes.
`/plugin marketplace add secustor/claude-plugins`, one install, and every
later session has the tools _and_ knows how to use them.

## User story

As a Claude Code user who wants my agent to debug Renovate configs, I want
to install one plugin instead of registering an MCP server by hand and
hoping the agent discovers the right call sequence, so that the session
starts with the tools and the workflow already in place.

## Scope

- New repository `secustor/claude-plugins` containing only
  `.claude-plugin/marketplace.json` (marketplace name `claude-plugins`) and
  a README — the plugin entry uses the `git-subdir` source type
  (`{url, path, ref?}`, sparse clone, built for monorepos) pointing at
  `plugins/renovate-config-debugger` in this repository, so consumers
  fetch a kilobyte catalog, never this monorepo, and the catalog changes
  only when a plugin is added or repointed.
- One plugin, maintained here at `plugins/renovate-config-debugger/`:
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

- **Thin catalog repo, plugin content stays here.** `/plugin marketplace
add` clones the marketplace repository and re-fetches it on update; an
  in-repo marketplace would make every plugin consumer clone this entire
  monorepo to read one JSON file. The split takes the best of both:
  consumers get a kilobyte catalog that is one `marketplace add` for
  _every_ future secustor plugin, while the plugin's skill and MCP config
  stay versioned and reviewed in this repo, next to the CLI whose
  interface they describe — so the drift risk that normally argues against
  a second repo doesn't apply (the catalog names the plugin, it doesn't
  restate its content). The `git-subdir` source's optional `ref` pin is
  the escape hatch if a plugin release ever needs to lag the repo's HEAD.
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

## As built (2026-08-05)

Shipped here: `plugins/renovate-config-debugger/` —
`.claude-plugin/plugin.json` (name `renovate-config-debugger`, matching the
plugin directory), `.mcp.json` launching
`npx -y @renovate-config-debugger/cli@0 mcp`,
the `skills/debug-renovate-config` skill, and a README carrying the
install-scope guidance (project scope for a repository whose config people
debug; user scope for someone who debugs Renovate configs everywhere). The
marketplace one-liners joined 060's agent-facing section in the root README and
the CLI README; AGENTS.md points repo-internal agents at the same skill file,
so this project debugs its own configs the way it tells consumers to.

The skill encodes the sequence the research settled — `run_config` first and
reuse its `runId`, check `accepted` before believing anything downstream, read
the digest before pulling anything large, preset-node bodies one node at a
time, `compare_simulations` as the oracle that PROVES an edit changed behavior
— plus the two things a session otherwise relearns painfully: a matcher
reporting `no-input` means the simulated dependency was underspecified, not
that the rule is wrong; and a preset that failed to fetch silently removes
everything under it from the effective config. The CLI (`--format json`) is
documented as the fallback for sessions without the MCP server.

**Remaining follow-up, deliberately out of scope here:** the thin
`secustor/claude-plugins` catalog repository — a
`.claude-plugin/marketplace.json` (marketplace name `claude-plugins`) plus a
README, with one `git-subdir` entry pointing at
`plugins/renovate-config-debugger` in this repository, so consumers fetch a
kilobyte catalog and never clone this monorepo. Until it exists,
`/plugin marketplace add secustor/claude-plugins` does not resolve and the
documented install path is aspirational; the plugin directory itself is
complete and installs from a local checkout. It also depends on 059 having
actually published the CLI, since the plugin's MCP command is
`npx -y @renovate-config-debugger/cli@0 mcp`.

One decision above did not survive: 060's `claude-code-hint` marker was
dropped entirely rather than kept inert — an official-marketplace listing is
not realistic for this plugin, so the marker could never fire (see 060's
as-built notes). This marketplace is the install channel, full stop.
