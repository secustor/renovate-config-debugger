# 058 — `rcv`: the debugger CLI on the shimmed engine

Milestone: M16 · Status: done (2026-08-05) · Stability: **experimental**

The CLI is an experimental surface: its subcommands, flags and output
shapes may change in any release while the interface finds its users.
Only the engine's own trace semantics (proven by golden↔shimmed parity)
are stable underneath it.

Derived from the
[2026-08 agent debug interface research](2026-08-agent-debug-interface-research.md),
whose feasibility spike this item turns into a package.

## Summary

Agents (Claude Code sessions, CI bots, the 019 persona skill) that need to
debug config resolution today either drive the web app in a browser — full
information, read through pixels — or import the engine in plain Node, which
is silently lossy: the preset tree and provenance are reconstructed from
Renovate's log stream by the logger shim, so they only exist in the shimmed
module graph. This item adds `packages/cli`: an `rcv` bin that hosts the
**browser module graph under Node** via Vite's SSR module runner with the
existing `renovateShims()` plugin, giving the terminal the same information
the web app renders — preset tree with per-node bodies, per-key provenance,
resolved-config document, simulator, A/B compare, translated validation
errors — as structured data.

## User story

As an agent (or a human in a terminal) debugging a Renovate config, I want
one command that resolves the config exactly as the visualizer does and
answers "what did `extends` expand into", "who set this key", and "would
this PR match", so that I don't have to drive a browser or trust a lossy
plain-Node import.

## Scope

- `packages/cli` workspace package, bin `rcv`, built on the spike's runner
  (Vite `createServer` + `ssrLoadModule`, `renovateShims()` active,
  `ssr.noExternal: [/renovate/, /fast-json-patch/]`, HMR off).
- Subcommands, one per question — `run`, `validate`, `digest`, `tree`,
  `provenance`, `resolved`, `simulate`, `compare`, `docs` — mapping 1:1 onto
  existing engine/app modules; no new resolution logic.
- `--format <pretty|json>` on every subcommand, defaulting to `pretty`;
  `--format json` emits the typed `TraceResult`/`SimulationResult` slices.
- Inputs: file path, stdin, or `--repo owner/repo` (via `fetchRepoConfig`);
  `--global-config`, `--inherited`, `--platform`/`--endpoint`/
  `--platform-override`, `--inject` for unreachable presets.
- Tokens from env only (`RCV_*_TOKEN`, falling back to `GITHUB_TOKEN`/
  `GH_TOKEN`/`GITLAB_TOKEN`), mapped onto `setPresetAuth`; endpoint guard as
  below.
- Exit codes: `0` clean, `2` Renovate would refuse the config, `1`
  infrastructure error.
- CLAUDE.md wires `rcv` in as the sanctioned way to debug resolution;
  hoist the effective-config tally derivation out of `EffectiveConfig.tsx`
  into `lib/` so digest/tally parity is import-level, not re-implemented.
- Tests: golden↔shimmed parity already proves the engine; the CLI adds
  its own thin tests for arg parsing, output shapes, and exit codes.

## Decisions

- **The shimmed graph, not plain Node.** Parity is the entire point: the
  preset tree and provenance only exist when the logger shim is the module
  graph's logger. The spike measured ~0.7 s engine import + ~0.8 s
  `runPipeline` for `config:recommended` (1,080 tree nodes) — acceptable for
  a debugger.
- **Subcommand per question, `--help` as the discovery surface.** Agents
  discover CLIs by reading help text; separate verbs with distinct output
  shapes beat one command with many flags.
- **`pretty` is the default format.** A human at a terminal gets the digest
  narrative; agents and pipelines opt into `--format json`.
- **Exit `2` = config refused, deliberately.** Claude Code hooks treat exit
  2 as the blocking "feed stderr back to the model and fix it" signal, so
  `rcv validate` drops straight into a Stop/PreToolUse hook with no wrapper.
  `1` stays infrastructure error.
- **Read-only.** No `fix`/`migrate-file` verbs: agents edit configs with
  their own tools and use `validate`/`compare` as the oracle; the engine's
  `applyFixToText` stays available through `validate` output rather than as
  a mutation command.
- **Endpoint guard carried over from the app.** Fetchers send the host token
  to whatever endpoint the platform context resolves to, so tokens are only
  attached to endpoints from explicit flags/env — never from the config file
  under inspection — unless `--trust-endpoints` is passed (the CLI's
  `suppressTokens`).
- **Relation to `renovate-config-validator`:** upstream is the linter —
  pass/fail on the file as written, no preset resolution. `rcv` is the
  debugger; both run the same pinned `renovate` code, so they cannot
  disagree about semantics.

## As built (2026-08-05)

- `packages/cli`: `bin/rcv.mjs` boots `createServer({ configFile: vite.config.ts })`
  and `ssrLoadModule("/src/main.ts")`. The spike's two-server bootstrap turned
  out to be unnecessary — Vite loads its own TS config (and with it the shim
  plugin, imported by package name exactly as `packages/app/vite.config.ts`
  does it), so one server suffices. `server.hmr: false` alone still binds the
  dev WebSocket port; `ws: false` is what makes this a process that opens no
  sockets.
- The bin is the only file that touches the process. `renovateShims()` sets
  `define: { "process.env": "{}" }` for the whole graph, so argv, env and
  stdio are handed to `main(argv, io)` as data — which is also what lets the
  tests drive every subcommand in-process.
- **The hoist went further than one function.** `EffectiveConfig.tsx`'s tally
  is now `lib/effective-tally.ts`, and the digest ASSEMBLY (which was inline in
  the `use-run-summary` hook, i.e. equally unreachable) is `lib/run-facts.ts`:
  `deriveRunFacts` + `buildDigestInput`. The hook got shorter and now makes one
  pass over the event stream instead of three. `@renovate-config-debugger/app/headless`
  is the single subpath export the CLI imports them through; nothing from
  `features/` may be added to it (the shared layer must not import a feature).
- `--inject` needs a preset IDENTITY, which is Renovate's business, not the
  CLI's. So the run happens once without injections, the named preset is looked
  up in the resulting tree and its own `source` produces the key — the same
  path the app's "provide content" action takes. No preset-string parser was
  added.
- Exit `2` applies to every pipeline-running subcommand, not just `validate`:
  once Renovate would refuse the config, every answer that follows is
  hypothetical (023's framing), and a uniform rule is one thing to document.
- `simulate`'s pretty output reports the merge DELTA rather than
  `finalDependencyConfig` — the latter is the effective config with all of
  Renovate's defaults in it, which buries the answer. `--format json` still
  carries the whole document.

Left open: the `renovate-config-validator` comparison is documented, not
tested; nothing yet asserts that the CLI and the app produce byte-identical
digests for the same config (they call the same functions, which is the
structural version of that guarantee).

## Follow-up: publishing `rcv` as a second product

The intent (2026-08-08) is to publish `rcv` to npm as a product in its own
right, not keep it an in-repo tool. Two things in the as-built shape were
chosen as "smallest seam now" and do not survive that step; one licensing
question resolves cleanly.

- **License: `AGPL-3.0-only`, decided.** Renovate is AGPL-3.0, and so is this
  repo, so inlining `renovate/dist` into a published artifact is clean — it is
  exactly the distribution the license anticipates. The CLI's `package.json`
  declares `AGPL-3.0-only` and the bundle keeps Renovate's license notice.
  This is what frees the build to use `noExternal` inlining (which the shim
  trick requires) instead of contorting to keep `renovate` external.
- **Shims move from run time to build time.** The `ssrLoadModule` bootstrap
  cannot ship: it makes `vite` a production dependency, pays server boot plus
  on-the-fly transform of the inlined Renovate modules on every invocation
  (the transforms are not persistently cached), and sits on Vite's legacy SSR
  API (Vite 8's current surface is `createServerModuleRunner`). The published
  package instead runs `vite build` (SSR/library mode, `renovateShims()`
  active, same `noExternal`) at publish time, emitting a self-contained
  `dist/` the bin imports directly — the same module graph, baked once. The
  runtime bootstrap stays as the in-repo dev mode, so iterating on the CLI
  never waits on a build.
- **A build step needs a parity proof.** The structural guarantee ("the CLI
  calls the same functions") no longer covers the built artifact — the build
  itself could drift (a shim not applied, an extra transform). Publishing
  therefore adds a test that runs the built `dist/` against the shimmed
  suite's fixtures and byte-compares the results, making the artifact a
  fourth checked module regime alongside golden, shimmed, and the app build.
- **`app/headless` becomes a real package.** A published product cannot
  source its derivations from a private UI package through a raw-TS subpath
  export that only resolves inside a Vite graph, guarded by a comment. The
  barrel's contents (`effective-tally`, `run-facts`, `run-digest`,
  `preset-tree-stats`, the layer-parse schemas) move to a shared workspace
  package — `packages/headless`, sitting between engine and app — that both
  the app and the CLI import. That turns "the CLI quotes the same numbers as
  the UI" from convention into a resolution-enforced boundary, gives the
  shared layer its own typecheck/lint surface, and removes the CLI's
  duplicated `@` alias.
- **Versioning: lockstep with the Renovate pin.** Each `rcv` release bakes
  one exact Renovate version (the banner already prints it); Renovate bump
  PRs, which already run full CI, become the release cadence. Sequencing:
  extract `packages/headless` first (mechanical, de-risks the current
  as-built), then the build step plus parity test, then the publish plumbing
  — at which point "experimental" above gets revisited.
