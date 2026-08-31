# Claude Code hooks

Scripts Claude Code runs automatically at fixed points in a session, wired up
in [`.claude/settings.json`](../../../.claude/settings.json). They exist so a
session provisions itself and can't finish a turn on a red branch.

They are run as `node <file>.ts` (Node ≥24 strips the types; the repo pins 26)
and import nothing outside `node:` — SessionStart and CwdChanged have to work
in a checkout where `pnpm install` has not run yet, which is precisely the case
they are there to fix. `pnpm typecheck` covers them via `tools/tsconfig.json`.

## The hooks

### `sessionstart-check.ts` — SessionStart

Runs on startup, resume, clear and compact: `mise install` (non-fatal — without
mise the node/pnpm on PATH are used as-is) followed by `pnpm install`.

### `cwdchanged-check.ts` — CwdChanged

Runs on every working-directory change, `EnterWorktree` included, and
provisions the new root only when it has no `node_modules` — a fresh worktree.
An ordinary `cd` inside an installed checkout stays free.

### `pretooluse-check.ts` — PreToolUse

Denies Bash calls using `npm`, `npx` or `yarn`. The workspace is pnpm-only:
pinned `packageManager`, pnpm lockfile, and `pnpm-workspace.yaml` carrying the
patches and `allowBuilds` decisions that another package manager would ignore.

### `stop-check.ts` — Stop

Runs the checks from CI's `lint` and `test` jobs before the turn ends, and
blocks the stop if any fail, handing back the tail of the failing output.

- **Always** (when anything changed): `pnpm lint`, `pnpm format:check`,
  `pnpm typecheck`.
- **Per changed package**: engine tests, app unit/render tests plus the dev
  module-graph guard, cli tests, oauth-worker tests, and `pnpm test:tools` for
  a `tools/` change. Consumers run too, not just the package that changed: an
  engine edit re-runs the app and the CLI, an app edit re-runs the CLI (it
  imports `@…/app/headless`). A root-level change runs all of them.
- **Never**: the Playwright e2e suite. It needs a production build first and
  takes minutes — running it stays a deliberate step
  (`pnpm --filter @renovate-config-debugger/app build` then `… test:e2e`).

Markdown-only changes skip everything, since none of the checks read prose.

Two things keep it from getting in the way:

- **A green fingerprint.** The SHA-256 of the diff against the base ref (plus
  untracked file contents) is stored in the worktree's git dir after a green
  run. The checks are derived from that same content, so an unchanged
  fingerprint means an unchanged verdict and the stop is free.
- **A circuit breaker.** After 3 consecutive blocked stops the next one is let
  through, with the failures written to stderr. Blocking forever on something
  the agent cannot fix burns tokens and hides the problem from the user.
