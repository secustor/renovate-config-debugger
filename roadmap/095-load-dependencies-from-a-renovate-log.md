# 095 — Load dependencies from a Renovate log

Milestone: M21 · Status: in progress · A second source for the discovery view
that [087](087-ghost-row-and-repo-deps.md),
[089](089-dependencies-tab-and-data-table.md) and
[090](090-pipeline-extract-phase.md) render.

## The ask

Every dependency surface — the Dependencies tab, Tests › From repository and
Pipeline › Extract — needs a repository the debugger may read. Some users will
not grant that: the repository is private, the org forbids third-party OAuth
apps, or the host is one the walk cannot list. They can still run Renovate
themselves, and a debug run already logs what extraction found.

"Load from log…" takes the log of a full Renovate run
(`LOG_LEVEL=debug LOG_FORMAT=json`), picked as a file or pasted, and fills the
same `RepoDepsView` that "Load from repo…" produces. The three surfaces render
it unchanged, and every place that named the repository now names the log.

## What the log provides

The parser (`lib/renovate-log.ts`) reads NDJSON, skipping lines that are not
JSON (and tolerating a prefix before the `{`, such as CI timestamps), or a
single JSON array of log objects. It matches `msg` exactly:

| `msg`                            | Used for                                              |
| -------------------------------- | ----------------------------------------------------- |
| `Renovate started`               | `renovateVersion`, when the repository line lacks one |
| `Repository started`             | `renovateVersion`                                     |
| `Dependency extraction complete` | `stats.managers` — the managers that matched files    |
| `packageFiles with updates`      | `config: Record<manager, packageFile[]>` — the rows   |

`Repository config` is not read in this iteration.

- **One repository, one base branch.** The first repository with a
  `packageFiles with updates` line wins; within it, the first base branch
  (Renovate processes the configured `baseBranches` in order, the default
  first), and of that branch's lines the last one. The other base branches are
  named in a note. An autodiscover log's other repositories are dropped
  silently for now.
- **The same rows as a walk.** Each package file goes through
  `repoDepsOfFile`, the mapping the walk uses. `regex`/`jsonata` become
  `custom.regex`/`custom.jsonata`, the walk's labels.
- **Skip reasons are split by who set them.** Extraction's own (`file:` links,
  unspecified versions) still hide a dep. The ones config or lookup set —
  `disabled`, `ignored`, `package-rules`, `github-token-required`,
  `internal-error` — do not: a config edit can undo them, and the reader is
  here to test config edits.
- **`managersConsidered` is approximate.** A log's stats name only the managers
  that matched, so the Extract phase says "N managers matched files in the
  Renovate run" instead of "K of N".
- A log without a `packageFiles with updates` line (an info-level log) gets an
  error asking for `LOG_LEVEL=debug` and `LOG_FORMAT=json`.

## What it can't provide

- **The config text.** `Repository config` is Renovate's parsed and possibly
  migrated object, not the file. Importing it into the editor would lose
  comments, JSON5 and the original layout, so it is not imported.
- **Package file contents.** A log has deps, not files, so config edits don't
  re-extract; the footnotes say so. Custom managers whose `matchStrings` you
  edit still show what the logged run extracted.
- **Files without deps.** Renovate logs only package files that yielded
  something, so the Extract phase's file list is shorter than a walk's.
- **The pinned Renovate's view.** The rows reflect the Renovate version that
  wrote the log. When it differs from the bundled one, a note says so.
- **A slug for local runs.** `--platform=local` logs the literal `local` as the
  repository. It is treated as no slug, and "local" is never printed as a
  repository name.
- **Mend-hosted logs** use a different format and are untested.

## The source is always visible

`RepoDepsView` gained `source: { kind: "repo" } | { kind: "log"; slug;
renovateVersion; pinnedVersion; baseBranch; otherBaseBranches }`, and
`lib/repo-deps-source.ts` is the one place that turns it into words:

- `acme/webapp` for a repository;
- `Renovate log of acme/webapp (v44.97.5)` for a log with a slug;
- `Renovate log (v44.97.5)` without one.

The Dependencies table's context note, the From-repository search row and
footnote ("taken from the Renovate log you loaded — config edits don't
re-extract"), the Extract phase's outcome and notes, and the empty states all
use it. `RepoDiscoveryGate` asks `hasDepsSource` instead of testing
`repo === ""`, so a slugless log is not mistaken for "no repository". The
editor toolbar shows a "deps from …" chip with **clear log** beside the
trigger.

## Shell

`app/use-log-deps.ts` holds the overlay state, its inline error and the
log-derived view. App uses that view in place of `useRepoDeps`'s while it is
set, and skips discovery meanwhile. A log load replaces a repository view;
loading a repository (a new `LoadedRepo`) clears the log; clearing the log
brings the repository view back. The two overlays are exclusive.

## Privacy

Renovate redacts tokens in its logs, but hostnames, registry URLs, usernames
and local paths stay in. So:

- the log is parsed in the browser — the overlay says "nothing is sent
  anywhere";
- the raw text is not kept: only the derived view is held, and the pasted text
  lives in the overlay until it closes;
- nothing from the log reaches a share link. `ShareState` carries the loaded
  repository, never the dependency view.

## Follow-ups

- **#427** — paste a JSON log into Tests and pick rows from it with the Data
  Table's row selection.
- Importing `Repository config` into the editor, with the lossiness stated.
- Showing the log's `updates[]` — what Renovate actually proposed — beside the
  simulator's verdict.
