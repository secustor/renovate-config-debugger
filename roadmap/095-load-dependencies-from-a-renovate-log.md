# 095 — Load dependencies from a Renovate log

Milestone: M21 · Status: in progress · A second source for the discovery view
that [087](087-ghost-row-and-repo-deps.md),
[089](089-dependencies-tab-and-data-table.md) and
[090](090-pipeline-extract-phase.md) render.

## The ask

Every dependency surface — the Dependencies tab, Tests › From repo or log and
Pipeline › Extract — needs a repository the debugger may read. Some users will
not grant that: the repository is private, the org forbids third-party OAuth
apps, or the host is one the walk cannot list. They can still run Renovate
themselves, and a debug run already logs what extraction found.

The log of a full Renovate run (`LOG_LEVEL=debug LOG_FORMAT=json`), pasted,
uploaded or dropped, fills the same `RepoDepsView` a repository walk produces.
The three surfaces render it unchanged, and every place that named the
repository now names the log.

## The overlay (Proposal F)

The toolbar's "Load from repo…" became **"Load repo or log…"**, and opens one
overlay with two tabs (a real tablist: arrow keys, Home/End) and a muted hint
for the active one:

- **Repository** — "full experience: config, dependencies and tests". The
  existing `RepoLoadForm`, unchanged. The design's "Your repositories" list is
  the signed-in `RepoPicker` (085) that form already renders.
- **Renovate log** — "dependencies for Tests and the Dependencies tab". Empty
  state: a textarea parsed as it is typed, "Upload log file…", a drop target
  over the whole tab, "use a sample log", the parser's error inline and a hint
  on how to get the log. Parsed state: the file name ("pasted log" for a
  paste), `N package files · N deps · N updates · base … · Renovate …`, a
  PACKAGE FILE | MANAGER | DEPS | UPDATES table and **Replace**. The primary is
  "Load N dependencies", where N is `view.deps.length` of the same
  `logDepsView` the Dependencies tab shows, so the two cannot disagree.

Both panels stay mounted while the overlay is up, so a tab switch keeps what
was typed and focus stays on the tabs. Run stays disabled while the overlay is
open ("Finish or cancel Load from repo first", unchanged).

**The sample log** (`data/sample-renovate-log.ts`) is app code, not the test
fixture: three package files (npm, github-actions, dockerfile), deps with and
without updates, a `renovateVersion`, and no `repository`, so it never offers
to load a config from a repository that does not exist.

## What the log provides

The parser (`lib/renovate-log.ts`) reads NDJSON, skipping lines that are not
JSON (and tolerating a prefix before the `{`, such as CI timestamps), a
single JSON array of log objects, or one (pretty-printed) object — the lone
`packageFiles with updates` entry. It matches `msg` exactly:

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
- **`updates` are kept.** Each dep's `updates[]` entries with an `updateType`
  are kept as `{ updateType, newValue }`, by dep index. They feed the
  overlay's UPDATES column (counted over the rows, like DEPS) and the pin
  drafts below.
- Two errors, both inline: text with no JSON line gets "Couldn’t read this as
  JSON — expected one JSON object per line (LOG_FORMAT=json).", and a log
  without the entry (an info-level log) gets "Read N log lines, none of them a
  “packageFiles with updates” entry. Renovate only logs it at debug level."

## Pinning what Renovate proposed

A log-sourced row in Tests › From repo or log offers the log's own updates as
its quick-pin chips (`minor → 4.18.1`, `digest`, …) instead of the
patch/minor/major guesses, and the draft opens with that update type and next
version filled in. A row without updates keeps the three guesses.

`RepoDraft.type` was widened from `"patch" | "minor" | "major"` to `string`,
the type `FormState.updateType` already has: a log proposes `digest`, `pin`,
`pinDigest`, `lockFileMaintenance`, `rollback`, `bump` and `replacement` too,
and every one of them is something `matchUpdateTypes` can match. None is
skipped, `pinDigest` included, although the Manual form's `updateType`
suggestions do not list it.

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
`repo === ""`, so a slugless log is not mistaken for "no repository".

The editor toolbar shows a "deps from …" chip with **clear log** beside the
trigger. Proposal F has no such chip; it is kept on purpose, because it is the
only way back from a log to the repository's own dependencies.

## Shell

`useRepoLoad`'s `repoFormOpen` is the one open flag. `app/use-log-deps.ts`
holds the log tab's state (the active tab, the draft, the preview parsed from
it, the checkbox) and the log-derived view. App uses that view in place of
`useRepoDeps`'s while it is set, and skips discovery meanwhile. A log load
replaces a repository view; loading a repository (a new `LoadedRepo`) clears
the log; clearing the log brings the repository view back.

**"also load `<slug>`’s config into the editor".** When the log names a
repository (not `local`), the log tab's footer offers this checkbox, off by
default. Checked, "Load N dependencies" sets the log view and then runs the
same load as the Repository tab for that slug, with the current platform
context and the user's repository access. That one load keeps the log as the
dependency source: the hook records the slug, and the `LoadedRepo` reset spares
the log when the new repository matches it. Any other repository load still
replaces the log. A failed load leaves the overlay open; opening the overlay
again, or clearing the log, drops the recorded slug.

**Tests › Paste JSON hands a log over.** The tab's intro names the two formats
it detects ("Full log" and "Dependency JSON"). A paste the log parser accepts
opens the overlay on its Renovate log tab with the text prefilled
(`RepoConnectOffer.onOpenLoad(returnFocus, { tab: "log", text })`); the user
confirms with "Load N dependencies" and picks rows in Tests › From repo or log.
A single descriptor object still fills the Manual form. When neither parses
and the paste had several JSON lines, the log parser's error is shown.

## Privacy

Renovate redacts tokens in its logs, but hostnames, registry URLs, usernames
and local paths stay in. So:

- the log is parsed in the browser — the overlay says "Nothing leaves the
  browser.";
- the raw text is not kept: only the derived view is held. The draft text lives
  in the shell hook while the overlay is open and is dropped when it closes;
- nothing from the log reaches a share link. `ShareState` carries the loaded
  repository, never the dependency view.

## Follow-ups

- **#427** — the full in-tab view: a pasted log shown in Tests as a Data Table
  whose rows are selected for pinning, instead of the hand-off to the overlay.
- Importing `Repository config` into the editor, with the lossiness stated.
- Showing the log's `updates[]` beside the simulator's verdict, not only as
  pin drafts.
