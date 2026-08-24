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
  with ⟨token⟩"). Its shape is Proposal F's (a review round re-aligned it after
  the first cut copied 18e's standalone mock instead): a one-line bar at the
  foot of the config pane — above the pane's footer promise, with the agents
  note below that (Proposal F draws the note as the pane's last row; the app
  widens it to a centered row of the whole frame, since it speaks for the
  page, not the document) — whose panel
  opens UPWARD, so the bar never moves; and its collapsed line is the
  credentials statement itself, `github.com ✓` / `github.com anonymous`, plus
  `· +N` when other hosts carry tokens. The upward opening is
  `flex-direction: column-reverse` on the open `<details>` (summary stays first
  in the DOM for the accessibility tree), which is why the panel is one wrapper
  div.

  The sentence's host blank is **free text**, not a picker of the four hosts
  this app has canonical rows for: a custom row is a real `hostRules` entry —
  `matchHost` + `hostType` + `token`. The engine resolves it per request URL
  (`resolveAuthToken` in `packages/engine/src/auth.ts`): the most specific
  matching rule wins — longest `matchHost` first, exact host or a dotted
  subdomain of it (never a bare suffix, so `gitlab.example.com` cannot be
  claimed by `evilgitlab.example.com`), a rule naming the host type beating an
  equally specific untyped one — and with no match it falls back to the
  per-type token, which is exactly the pre-076 behavior. A host typed by hand
  gets `hostType: "any"`; the quick-fill chips (`registry.npmjs.org`,
  `docker.io`, `gitlab.example.com`) fill both blanks' types at once. Naming
  one of the four canonical hosts writes THAT row's type token instead of
  creating a rule, so no host ever gets two rows.

  The rules are secrets like every other token: sessionStorage only
  (`rcd.hostRules`, one JSON value — the rows are dynamic, so a key per host
  would leave orphans), never localStorage, never in a share link, and wiped
  by the untrusted-endpoint guard along with everything else (they ride in the
  same `PresetAuth` object `suppressTokens` overwrites). Both ends re-validate:
  a rule that fails `isValidHost`/`isValidToken` is neither stored nor handed
  to the engine.

  Honest limit: an `npm` or `docker` rule is accepted and stored, but the
  browser only has code-host fetchers (github/gitlab/gitea/forgejo). Such a
  rule therefore takes effect only if one of those fetchers ever targets that
  host — it does not make this app fetch a registry.

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
- **The landing's stage walk now finishes before the shell docks in.** The
  075 narration stepped on a timer while the run ran, and a warm run finished
  in ~150 ms — one frame of "starting Renovate's own code…" and the landing
  was gone. The design (`Landing Transition.dc.html`) has it the other way
  around: the walk IS the transition, and the results wait for it. So the
  first result commit (and only the first — `shellDockedRef`) holds until
  `StageRailPreview` signals its walk complete (`onWalkEnd`, fired one step
  after the Merge frame). A signal rather than a matching timer in App,
  because the engine's first import blocks the main thread, which stalls the
  walk's interval but not a wall-clock timeout — the fixed-duration version
  measurably cut the walk at five of eight stages. The step pace dropped to
  the design's 160 ms, reduced-motion readers signal immediately (no walk, no
  hold), and a capped race (`LANDING_WALK_CAP_MS`, 4 s) guarantees a lost
  signal can only delay the answer, never withhold it.
- **The walk's glyphs are the rail's glyphs — colored by what is knowable.**
  Both rails now draw through one `StageGlyph` component (one element, one
  class vocabulary, so the teaser cannot drift from the rail it teases). A
  walked node stays the accent `lit` — activity, never a verdict: mid-run the
  app knows which stage Renovate's code is walking and nothing about how it
  came out, so the rail's green/gold/red would be a claim (a review pass
  tried `clean` green and reverted it for exactly that reason). The one
  pre-run FACT the walk does state is an absent 008 layer: those nodes wear
  the rail's hollow `skipped` glyph (`previewSkippedStages`, derived in App
  from the layer parses — the design's walk draws the same hollow-vs-filled
  distinction), and Merge stays unlit for the real rail to light. Full
  `StageRail` reuse was considered and rejected — it needs a `TraceResult`,
  its nodes are buttons (a no-op button is a false affordance, a disabled one
  swallows the glossary hover), and its labels carry run-explainers where the
  landing deliberately carries glossary terms.
- **The credentials line is a derivation, not markup.** A sign-in and a GitHub
  PAT are one credential for github.com, not two; an empty session is stated
  positively (`github.com anonymous`) rather than as "the count is zero". The
  line's subject is the platform's canonical site host on the shipped endpoint
  (`github.com`, not `api.github.com` — the design names the place, not the API
  path to it) and the override's own host once the endpoint is pointed
  elsewhere, which is where requests actually go.

## Copy touched

`StageDiff`'s skipped-stage notes for `global`/`inherit` (they point at the
editor directly above them now), `STAGE_EXPLAINERS` for the same two stages,
`UntrustedHostBanner` and `use-repo-load`'s two unknown-host notices (both named
the old section title), App's two run-blocking layer messages (they say which
stage card to fix it on), and `StaleResultsBanner`'s doc comment.
