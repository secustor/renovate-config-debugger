# 090 — The Pipeline tab's Extract phase, behind a phase picker

- Milestone: M21 · Status: done
- Design: Claude Design project "Renovate Config Debugger", artboards
  `Extract Phase.dc.html` and `Proposal F - Integrated Shell.dc.html`
  (pipeline mode)

## The ask

The Pipeline tab has always shown one thing under a name that promises four.
What it draws is Renovate's **config** pipeline — 008's eight stages, global
through merge — while production Renovate walks four phases per repository:
resolve the config, extract the dependencies, look each one up, and decide the
updates.

[087](087-ghost-row-and-repo-deps.md) shipped the second of those phases as an
engine (`matchExtractableManagers`, `extractDeps`, the tree walk in
`use-repo-deps.ts`) and [089](089-dependencies-tab-and-data-table.md) gave its
RESULT a tab. Neither showed the phase itself: which managers claimed which
files, which of those files were read, and what came out of each. This item is
that view, and the picker that puts it in Renovate's own order.

## What shipped

### The phase picker

Four segments at the top of the tab, through the app's own
`SegmentedControl` (`features/pipeline/PhasePicker.tsx`) — a control that
labels a STATE, which is exactly what a phase choice is, and which carries the
radiogroup semantics a hand-rolled row of buttons always forgets.

- **Config** — the tab as it was, unchanged, down to the same DOM: the stage
  rail, the stage card, the rewrite stepper. Its subtitle is the effective
  config's option count.
- **Extract** — the new view. Its subtitle is `+N deps` in the verdict green,
  and only once discovery has REPORTED: a zero before that would claim the
  repository has none (089's rule for the tab badges, applied to a segment).
- **Lookup** and **Update** — rendered, disabled, `title="Not available
today"`, subtitle "not available yet". Both need the live datasource calls
  the engine deliberately severs (078's "not in scope"), so the honest thing
  is to name them and say so. Dropping them would teach the sequence wrong,
  and enabling them would be a lie with a spinner on it.

`SegmentedControl` grew one optional `disabled` per option for this, which is
the whole diff to the shared component.

### The Extract phase

A three-node track and one card beneath it, selected by node:

1. **Match managers** — "K of N managers matched files". One row per manager
   that claimed something, most files first; the collapsed row previews its
   paths, the open one lists each file with what it yielded.
2. **Scan files** — "N package files scanned". One row per file discovery
   actually READ, its dep count and the managers that claim it; open, the deps
   themselves.
3. **Extract deps** — "N dependencies from owner/repo", and the node selected
   first, because it is the phase's result. Grouped by the manager that read
   them, with a link on to the Dependencies tab rather than a second copy of
   it.

The track wears the stage rail's own classes (`08-landing.css`) rather than a
second dot-on-a-line implementation, so the two cannot drift apart visually.
It is deliberately NOT `StageRail` itself: that component is typed on the
engine's `StageId` and reads a `TraceResult` for its glyphs, and extraction is
not a pipeline stage.

### Data honesty

Everything the view states is arithmetic over the discovery record, and the
record grew exactly what the view needs to be honest:

- **`RepoDepsView.files`** — every matched path, in walk order, with the
  managers that claim it and what became of it
  (`extracted` / `no-deps` / `not-read` / `unreadable` / `error`). Matching is
  the cheap path-only step, so this covers the whole walk; 087's fetch cap of
  ten only decides which of them were READ. A file the cap dropped says **"not
  read"**, never "no deps" — that would be a claim about bytes nobody fetched.
- **`RepoDepsView.managersConsidered`** — how many managers the walk asked
  (the extractable ledger minus the default-disabled and the pattern-less
  ones, neither of which a filename walk can match). It is the denominator of
  "K of N", so the sentence cannot quietly become "K of all of Renovate's".
- **The footnotes** state what the walk is not: how many managers matched
  nothing, how many matched files went unread, whether GitHub truncated the
  listing, and — permanently, until the walk becomes config-aware — that
  **`enabledManagers` and `ignorePaths` from the merged config are NOT applied
  to it**. Only Renovate's own default ignore of `node_modules` /
  `bower_components` is (`use-repo-deps.ts`'s `IGNORED_PATH`). The design
  sketched those notes as claims that the config HAD applied; the data does
  not support that, so the sentence is inverted rather than dropped — a reader
  whose `enabledManagers` is narrow must not conclude Renovate is ignoring it.

The four states before a report are the Dependencies tab's, for the same
reason: no repository is an offer (`RepoConnectPanel`), reading and failed are
statuses, and nothing found is a fact. None of them may be drawn as a track of
zeros.

### The engine hand-off

`matchExtractablePaths` returned bare paths, which meant the attribution the
first node needs could only be recovered by a per-path re-scan — the exact
thing that function's one-pass-per-manager shape exists to avoid. It is now
`matchExtractableManagers`, returning `{ managersConsidered, files: [{ path,
managers }] }` from the same single pass. Same cost, same order, one caller.

### Wiring

- The phase is **App's state**, not the panel's: opening the Extract phase is
  what TRIGGERS discovery, and every results panel stays mounted (028), so a
  panel-side effect would fire for a tab nobody has looked at. App's existing
  `tab === "deps"` trigger became `tab === "deps" || (tab === "pipeline" &&
phase === "extract")`; `ensure` is idempotent per loaded repo, so the three
  doors onto discovery never discover twice.
- It reaches the panel through the run-view context (086's admission rule: it
  changes on a selection, never on a keystroke), and `onOpenDependencies` is
  `jumpToTab("deps")` — the shell owns tab switching, and the jump records the
  one-step way back like every other cross-tab link.
- `PipelinePanel` is now the phase switch and nothing else; everything it used
  to be is `ConfigPhase`, one component down, unchanged.

## Deltas from the artboard

- **The phase is not in the share payload.** Every other pipeline sub-state is
  (`stage`, `step`), so this was a real choice: the Extract view depends on
  repository ACCESS the recipient of a link may not have, and a link that
  opened on it would show the connect panel where the sender saw their
  extraction. `tab=pipeline` lands on Config, which is the phase every reader
  can see. Cheap to add later — the codec validates fields independently and
  `simStep` is the precedent for an additive one.
- **"K + M custom" is rendered as "K".** 063's custom managers are still
  unimplemented, so nothing can produce a `custom.`-prefixed manager id today
  and "+ 0 custom" would be a control panel for a feature that does not exist.
  The sentence takes the suffix the day the ledger can carry one.
- **The fetch cap is counted, not named.** The footnote says how many files
  went unread and that discovery caps its fetches; it does not print "10",
  because the number belongs to `use-repo-deps.ts` (the app shell) and the
  feature may not reach for it. Wording the sentence cap-agnostically was
  cheaper than putting the constant on the view.
- **No per-file "open in the editor" or row actions.** The artboard's rows are
  read-only here: the actions on a dependency are the Dependencies tab's
  (089), and the footer is the one-click way to them.

## Verification

- `features/pipeline/extract-phase.test.ts` (unit) — the three nodes' counts
  and sentences (including "1 dependency", not "1 dependencies"), manager
  ordering and its file lists, the scanned/matched split, the per-file note
  for every outcome (an unread file is never "no deps"), the dep grouping, and
  the footnotes appearing and disappearing with what they report.
- `features/pipeline/PhasePicker.test.tsx` (components) — four phases in
  Renovate's order, the two disabled with their reason, the Config count, the
  Extract count only once discovery reported, and the selection callback.
- `features/pipeline/ExtractPhase.test.tsx` (components) — the four pre-report
  states, none of which draws a track; the default node; each card's header
  sentence and what it opens onto; the unread file present under Match
  managers and absent under Scan files; the hand-off to the Dependencies tab.
- `packages/engine/test/extract.node.test.ts` — the walk's attribution: input
  order, extractable managers only, and a denominator bounded by the ledger.
- e2e: `07-stage-chip-outcomes` now asserts the picker leads the tab with
  Config active and Lookup disabled, before the stage-rail assertions it
  always made.
