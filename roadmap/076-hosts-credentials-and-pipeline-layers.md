# 076 — Hosts & credentials; the layers move to their stages

Milestone: M20 · Status: done (feat/v2)

## Summary

Design turn 18 of the Claude Design project asked what the footer drawer under
the editor is actually for, and answered it twice. Both answers shipped:

- **18d — the two self-hosted config layers are edited on their pipeline
  stages.** The 008 global and inherited configs used to be two `<details>`
  disclosures at the bottom of the Advanced zone, three clicks from the diff
  that reports what they did. The Pipeline tab's rail has always carried a
  `global` and an `inherit` node; selecting one already opened a stage card. The
  layer's INPUT now lives in that card, immediately above the `StageDiff` it
  produces.
- **18e — what is left becomes "Advanced — hosts & credentials".** The drawer
  keeps the fetch context (which host `local>` presets resolve against) and
  gains a `hostRules`-shaped list of the credentials this browser tab is
  carrying: one row per host, github.com always first and fixed, everything else
  added through a sentence with two blanks ("Requests to ⟨host⟩ authenticate
  with ⟨token⟩"). Its collapsed line says the context (`github ·
api.github.com`) and a status pill — `default`, or `N credentials`.

Nothing about how a run is computed changed: the same two layers reach
`RunInputs` through the same parse, the same token storage rules (030's
header-injection check, roadmap 009's sessionStorage-only) are untouched, and
share links carry exactly what they carried.

## What moved where

| Was                                                                          | Is                                                                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `AdvancedZone` → "Global config" `<details>`                                 | Pipeline tab → `global` stage card → `StageLayerEditor`                                          |
| `AdvancedZone` → "Inherited config" `<details>` (+ 045's probe-state banner) | Pipeline tab → `inherit` stage card → `StageLayerEditor`                                         |
| `AdvancedZone` → "Repository host & access tokens"                           | Split: "Repository host" (platform/endpoint, 010's reflect-then-override) + the credentials list |
| Four always-present token inputs                                             | One row per host that HAS a credential, plus an add-host form                                    |
| `useInheritedConfigLayer`'s `setAdvancedOpen` + `setInheritedSectionOpen`    | one `revealInheritedStage()` (App: `setSelectedStage("inherit")`)                                |

New modules: `features/editor/StageLayerEditor.tsx` (the layer editor a stage
card carries), `features/editor/credentials-summary.ts` (the drawer's collapsed
count, unit-tested beside it). `HostTokenDescriptor` gained a `host` field —
`github.com` / `gitlab.com` / `gitea.com` / `codeberg.org`, the hosts of
`PLATFORM_ENDPOINTS`' default endpoints — because a `hostRules`-shaped row is
addressed by host, not by vendor.

## Consequences worth stating

- **The drawer is shell-only now.** The landing carried a muted copy through
  075 so host tokens could be set before the first run; the review of this
  feature removed it (the landing keeps one question and one answer). A reader
  who needs a token before anything resolves runs first — and the failed
  fetch's own surfaces (the auth hint, the preset tree's failure rows) point at
  the drawer, which is on screen by then.

- **A layer can only be edited once a run exists.** The Pipeline tab does not
  exist before the first run, so neither do the two editors. The drawer says so
  rather than hiding it: before a run its intro reads "…appear on the Pipeline
  tab after your first run"; after one, the same sentence is a link that selects
  the `global` stage and jumps to the tab. The two e2e flows that used to paste
  a global config first now load a repo first, which is closer to what a user
  does anyway — they are looking at the run the layer is about to change.
- **A share link carrying layers no longer forces the drawer open.** It used to,
  because that is where the layers were. The only reason left is the
  untrusted-endpoint policy, whose banner tells the reader to go review the host
  — so the field holding it has to be on screen. A link's layers announce
  themselves on the rail instead: their stage nodes stop being "skipped" and the
  run's own diff is one click away.
- **The stale banner now covers layer edits.** `resultsStale` was the editor's
  text alone, and that was safe precisely because the layers were three
  disclosures away from the results. They are inside the results pane now, so a
  reader can retype the global config with the merge diff beside it. App records
  the layer pair each run carried (`layerKey`) alongside `lastRunContent` and
  compares both. Tokens and the endpoint stay out of scope, as before.
- **`revealInheritedStage` selects the stage but does not switch tabs.** A repo
  load ends in a run, and that run's own landing (`executeRun`) decides which
  TAB the reader is put on; a probe overruling it would be the tab-yanking 068
  spent a review round removing. The stage selection does survive that run's
  commit (armed as a ref the commit honors, an errored stage still winning), so
  the reader who opens the Pipeline tab finds the `inherit` card — and the
  auto-loaded text with its origin line — already selected, where the node now
  reports a delta instead of "skipped".
- **The credentials count is a derivation, not markup.** A sign-in and a GitHub
  PAT are one credential for github.com, not two; `default` is stated positively
  (github, its shipped endpoint, nothing saved) rather than as "the count is
  zero", because the endpoint is half of what makes the defaults the defaults.

## Copy touched

`StageDiff`'s skipped-stage notes for `global`/`inherit` (they point at the
editor directly above them now), `STAGE_EXPLAINERS` for the same two stages,
`UntrustedHostBanner` and `use-repo-load`'s two unknown-host notices (both named
the old section title), App's two run-blocking layer messages (they say which
stage card to fix it on), and `StaleResultsBanner`'s doc comment.
