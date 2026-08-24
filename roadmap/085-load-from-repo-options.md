# 085 — Load-from-repo options: paste anything, or pick from your repos

- Milestone: M21 · Status: done 2026-08-23
- Design: Claude Design project "Renovate Config Debugger", artboard
  `Load From Repo Options.dc.html` (variants: inline / smart / browser /
  combined)

## The ask

The repo-load form (039/045/075) accepted `owner/repo`, `github.com/owner/repo`
and a repository home URL — nothing else. Two gaps:

1. A pasted **file or branch URL** — the thing people actually have in their
   clipboard after looking at a config on GitHub — was rejected:
   `https://github.com/owner/repo/blob/main/renovate.json` is not a repository
   URL to the old parser.
2. A **signed-in** user (009/065) still had to type a slug from memory; the
   session knew their repositories and told them nothing.

## Ruling

Of the artboard's four variants, ship two, keyed off the one GitHub session:

- **Signed out (or OAuth unconfigured): the `inline` variant** — the existing
  paste bar, unchanged in shape, with a smarter parser behind it.
- **Signed in: the `combined` variant** — the same bar plus a
  **"Your repositories"** section between the reference row and the inherit
  row. The `browser` and `smart` variants are folded in rather than shipped:
  the reference field doubles as the repo search (browser), and the parser
  understands everything the smart variant's "Understood as" panel parsed —
  without the panel, because the notice/fatal path already narrates a
  reference that did not parse.

## What the parser now accepts (`lib/repo-reference.ts`)

Extracted from `use-repo-load` (where it was private and untestable) and
extended. A reference may now also pin a **ref** and an exact **file**:

- `owner/repo@branch`, `github.com/owner/repo@branch`
- `…/tree/<ref>` (GitHub), `…/-/tree/<ref>` (GitLab, subgroup-safe)
- `…/blob/<ref>/<path>`, `…/raw/<ref>/<path>` (GitHub),
  `…/-/blob/<ref>/<path>` (GitLab), `…/src/branch/<ref>/<path>`
  (Gitea/Forgejo), and `raw.githubusercontent.com/owner/repo/<ref>/<path>`
  (normalized to github.com; the `refs/heads/…` form too)

Precedence: the form's own branch field wins over a ref the reference carries —
it is the more deliberate gesture. A reference that names a FILE loads exactly
that file (`fetchRepoFile`), never the 14-candidate discovery — discovery for
a URL that names a file would be inventing behavior. `package.json` gets the
same `renovate`-key extraction the discovery probe applies (mirrored in
`extractRenovateFromPackageJson` — the engine's own is private and lives on
the other side of the dynamic-import boundary).

## The picker (signed-in only)

- `platform/github-repos.ts` — `listUserRepos()` (one page of 100, most
  recently pushed first, archived dropped: Renovate does not run on archived
  repos) and `probeConfigFile()`: which config file would a load find? It
  reads git **trees** (one request per repo, plus `.github/`/`.gitlab/` when
  present, plus the package.json body when nothing else matched) instead of
  the contents walk, but iterates the engine's own `CONFIG_FILE_NAMES` (newly
  exported) so the badge names the file the load would find. github.com only —
  the one sign-in IS GitHub OAuth, so this module takes no endpoint.
- `app/use-repo-picker.ts` — the state: list fetched when the overlay opens,
  filtered live by the reference field, 8 rows visible, only visible rows
  probed (badges cached; a failed probe stays unknown and retryable, never a
  confident "no config found"). A sign-out drops the cache — it was that
  account's list.
- `features/editor/RepoPicker.tsx` — the section. **Picking a row only writes
  the reference field**, as `github.com/owner/repo` (host-qualified so the
  load pins the GitHub context whatever platform is selected); the one Load
  button stays the only trigger, so the branch field and the inherit row apply
  to a picked repo exactly as to a pasted one. The view-model types live in
  the feature and the app-shell hook imports them — the 048 layering rule
  (features never import `@/app`), pointed the only allowed way.

## Deliberate non-features

- No branch listing/autocomplete — the branch field stays free text.
- No pagination or org search past the first 100 — the picker is a shortcut
  over recent work; anything older is a paste away.
- The `smart` variant's "Understood as" breakdown — the parse is exercised by
  the load itself and unit tests, not narrated in the form.
