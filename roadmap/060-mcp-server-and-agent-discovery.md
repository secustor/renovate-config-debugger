# 060 — `rcd mcp` + pointing agents at the headless interface

Milestone: M16 · Status: MCP server done (2026-08-05), discovery pending

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
  the way a client exercises them.
- **Nothing is written to stdout by `rcv mcp`** — on a stdio transport stdout
  IS the protocol. Diagnostics go to stderr, which is also what keeps them out
  of a `--format json` document.

Still open here: the discovery half — the app footer, the READMEs, llms.txt
and the Claude Code hint marker — which lands once 059 has published the
package every one-liner names.

## Validation messages, and the listing budget (2026-08-16)

The persona study reported rejections reading `Invalid input, Invalid input`,
naming no field; the in-process suite said otherwise, and both were right —
they were measuring different module regimes. zod installs its English locale
as a top-level side effect while its `package.json` declares
`"sideEffects": false`, so rolldown drops the call when 059's
`ssr.noExternal: true` build inlines it. Under `src/` the locale is intact and
every message names its key; in the published `dist/main.js` the same rejection
degrades to a bare `Invalid input` — no typo'd key, no enum members, no
expected type — which voids exactly the self-correction the tool descriptions
promise. `src/mcp/zod-locale.ts` re-installs it as the first statement of
`createMcpServer`. The lesson generalizes past zod: the bundle regime can
silently degrade behavior that lives in a dependency's side effects, and no
in-process test can see it, so `test/bundle/` now holds suites that spawn the
built bin — the `bundle` vitest project runs them right after `pnpm build`,
same as 059's parity proof. (Sibling, untouched: the app's `zod/mini` schemas
in `src/lib/input-schemas-zod.ts` get the same treatment in the browser bundle.)

Measured against the same probe, `tools/list` was 15 289 B compact / 652 pretty
lines — descriptions 4 024 B, schemas 9 512 B. The dependency object alone was
1 528 B inlined three times (`simulate.dep`, `compare_simulations.dep`/`depB`):
48 % of schema bytes. Two changes, no capability lost: trimming its
object-level describe from 573 to ~210 chars (it ended in a parenthetical
re-listing the property keys immediately below it), and `.meta({ id:
"dependency" })` on the one shared schema instance, which makes zod's
`extractDefs` lift it into `$defs` with `$ref`s — the only dedup the SDK's
conversion leaves reachable, since it never passes `reused`. Result: 13 784 B /
574 lines, −10 % bytes and −12 % lines. `$ref` support is uneven in
non-Anthropic clients, so that half is the revertable one. The levers left on
the table, if the listing ever has to halve: dropping `depB` (−1 528 B) or
replacing `compare_simulations`'s two dependency objects with simulation ids
(−3 056 B) — both remove capability the study saw personas use. Not available
at all: the SDK has no brief mode, and its `tools/list` ignores the pagination
cursor.
