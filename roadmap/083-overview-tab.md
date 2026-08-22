# 083 — The Overview tab: what this config does, by topic

Milestone: M20 · Status: done (feat/v2)

## What the spec says

`Overview Tab Final.dc.html`, one artboard, labelled
_"Overview tab — what this config does"_. Its DCLogic data (31 behaviors, a
`config:recommended` run) is mock; its literals are the copy, and its inline
styles are the layout.

A panel, not a card in someone else's tab:

- **Header** — `What this config does`, a neutral count pill (`31`), and
  `behaviors · explained by their authors` in muted 0.78rem.
- **Intro** — "Every preset carries a sentence describing what it does. Here
  they are, sorted by topic instead of by preset."
- **Topic groups** — an uppercase 0.7rem/600/0.06em title
  (`Pull requests & noise`, `Grouping`, `Automerge`,
  `Safety & housekeeping`), then one row per sentence: a coloured dot, the
  sentence, and a right-aligned source chip. The chip has two shapes — a blue
  999px pill reading `repo config` when the reader wrote the sentence, a purple
  4px mono token naming the preset when they did not.
- **One toggle** — `22 more in "Everything else" — show all` ↔ `show less`,
  revealing a final `Everything else` group.
- **Footer** — above a hairline: "Every sentence here is pulled from a
  `description` field. Add one to your own `packageRules` or presets and it will
  show up here."

The design project's own note places this as variant 1a of "the description
digest (today's `DescriptionDigestCard`) reframed for non-experts", and states
the classifier rule: topics are "derived from description keywords (schedule,
group, automerge, limit…) — sentences that match no bucket land in a final
'Everything else' card, so nothing is hidden."

## What already matched

069 built the whole model. `computeDescriptionProvenance` attributes every
string of the resolved `description` array to the preset that wrote it,
`buildDescriptionDigest` groups them and counts the distinct behaviors, and the
069 card already rendered dot + sentence + preset-name rows over it, with the
`≈` approximate marks, the degraded caveat, the non-string footnote and the
`show raw order` jump into the Effective config's blame ledger.

What the card did NOT have was the tab, the topics, a chip on every row, the
header/intro/footer copy, or a card-level disclosure. 075 had also retired the
Overview tab outright, so the surface was living at the top of the Effective
config.

## What changed

### The classifier (`lib/description-topics.ts`, new)

Five topics, one documented regex each, case-insensitive, first match wins,
generic over the row (`Row extends { text: string }`) so the view's row shape
stays a view concern. `groupByTopic` returns the groups in the design's render
order, omitting the ones nothing matched, and `Everything else` last.

The regexes are written against real preset prose, not invented vocabulary —
every alternative appears in a shipped Renovate `description` (`:prHourlyLimit2`,
`:prConcurrent10`, `:dependencyDashboard`, `group:monorepos`, `:automergePatch`,
`workarounds:all`, `replacements:all`, `:ignoreModulesAndTests`).

### The Overview tab is a real tab again (`data/results-tabs.ts`)

`RESULTS_TAB_IDS` is six, `overview` first. `overview` leaves
`LEGACY_RESULTS_TAB_IDS` and its `LEGACY_TAB_TARGETS` row goes with it: it was
never a rename, it was a removal, and the removal is undone. A v1 share link
saying `tab=overview` now opens the Overview — the tab its sender was looking
at, which is a strictly better landing than 075's `→ tests`. The encoder needed
no change at all: `buildShareState` writes whichever `ResultsTabId` is active,
and `overview` is one again. `resultsTabIdSchema` still accepts it, now through
the current-ids half of its enum rather than the retired half.

### The panel (`features/overview/`, new slice)

`OverviewPanel.tsx` renders the artboard; `rows.ts` flattens 069's per-extend
digest back into one list for the classifier to regroup. `components/
DescriptionDigestCard.tsx` and its test are deleted — this is its successor, not
a second copy.

`ResultsColumn` mounts it as the `overview` panel and the Effective tab loses the
card, so that tab answers "what is the merged config" and this one answers "what
does it do". The badge follows the `effectiveStats` pattern: the panel reports
the count it rendered (`onOverviewStats` → App → `useRunSummary`), so the tab
badge and the card's own pill are one number, and there is no badge at all until
the async provenance settles.

### CSS

One new family, `.overview-*`, entirely in existing tokens; the `.desc-digest-*`
family is deleted with the component. The count pill is `.pill .pill-count`
unchanged (its `--border` / `--muted` / 0.7rem / `0 0.45rem` already IS the
artboard's), the preset token is `.preset-token` unchanged (8%/25% purple, 4px,
`0.02rem .35rem` — also already the artboard's), the dots are `.prov-dot`, and
the `repo config` chip is `.badge.prov-layer.explained.prov-repo`.

## Judgment calls

- **The blue `repo config` chip is `ProvenanceChip`, not a bare `.pill-accent`.**
  Both render the artboard's blue pill; only the chip carries 047's glossary
  hover card explaining which config level this is and where it sits in
  Renovate's merge order. "repo config" is the exact label 047 exists because
  readers were misreading, and dropping the card to save a component would
  reintroduce the misreading on the one surface aimed at people who have not
  read the docs.

- **The preset chips stay clickable, with their hover cards.** The artboard
  draws every chip inert. The app's standard token (081) is a `<button>` that
  selects the node in the resolution tree and previews it on hover. An inert
  name is a name the reader cannot follow, and this tab is exactly where "which
  preset is that?" gets asked — so the richer standard wins over the drawn one.

- **The dots keep the app's five layer hues.** The artboard has two (blue = mine,
  purple = a preset), which is all its mock run needs. A self-hosted run also has
  `global` and `inherited` layers, and `defaults`; painting a sentence from the
  bot's own config blue would say the reader wrote it. The two-colour scheme is
  the five-hue palette with three levels the mock does not exercise.

- **The card's count is its ROWS, not `digest.totals.behaviors`.** The two
  differ by the repo's own `packageRules` sentences, which never enter the
  top-level `description` array and so are not counted there. The card lists
  them, so the header pill (and the tab badge quoting it) counts them — 082's
  rule that a header must count what it is showing, or it becomes the one number
  in the view a reader cannot check.

- **Repeated sentences are dropped.** 069's digest keeps them, and names the
  extend whose every sentence was a repeat as `redundant`. Grouped by topic
  there is no such fact left to state — there is no per-extend group to call
  redundant — and the same sentence printed twice under one heading is exactly
  the noise this tab removes. The cost is real and is paid twice over: the
  redundant-extend callout has no home on this surface (the preset tree's
  `duplicate ×N` badge is where that fact lives now), and the array as Renovate
  built it is one click away behind `show raw order`, whose tooltip now says
  "repeats included".

- **Repo `packageRules` sentences are ordinary rows, with their citation as a
  `title`.** The design gives a row three slots and no fourth.
  `packageRules[0] — matchUpdateTypes → minimumReleaseAge` is a pointer for a
  reader who already knows what they wrote, not part of the sentence, so it
  becomes the row's tooltip rather than a fourth column of mono text.

- **`show raw order` sits in the header, right-aligned.** It is a card-title
  action (069 PR 3's placement, kept), so it sits with the count rather than
  interrupting the design's prose. It is still gated on the run actually having
  a top-level `description` row to land on.

- **One disclosure, and only one.** The 069 card had a `N more — show all` per
  group at five rows. The artboard has exactly one toggle, for the tail. A
  second cap inside the revealed group would make the reader wonder which of the
  two is hiding the sentence they are looking for, so `COLLAPSE_AFTER` is gone;
  a topic shows everything it holds.

- **The classifier tests in a different order than it renders.** Display order is
  the design's (`Pull requests & noise` first). Match order is
  automerge → grouping → safety → PRs, because sentences routinely name more
  than one subject and `Pull requests & noise` is the broad bucket —
  `schedul*`, `dashboard` and `limit` turn up in sentences whose real subject is
  one of the other three. "Weekly automerge schedule on early Monday mornings"
  is an automerge sentence.

- **`ignore` on its own is not a Safety keyword.** Half of `workarounds:all` is
  "Ignore <some broken release>", which is a fact about one package rather than
  a housekeeping rule — and the artboard's own tail files two of them under
  `Everything else` while filing "Ignore node_modules, bower_components, vendor
  and test directories." under Safety. The keywords are the paths
  (`node_modules`, `bower_components`, `vendor`, `ignore paths`), not the verb.
  All thirteen sentences the artboard draws reproduce its filing exactly; that is
  a test.

- **A run still LANDS on Tests, not on the Overview.** Overview leads the strip
  because it is where a reader orients, but landing is about the loop the app is
  shaped around — edit → Run → read — and an edit's answer is not "here is what
  your config does in general". Unchanged from 075; `firstError ? problems :
tests` still decides.

- **`legacyTabForView` gains no `overview` answer.** It fires only for a
  pre-028 link with no `tab` field, and it infers from what the sender had
  SELECTED — a preset node, a migration step, a stage. The Overview selects
  nothing, so no pre-028 link carries evidence that its sender was on it.
  Returning `null` leaves App's landing rule in charge, which is the honest
  answer: we do not know.

- **`AppShellHeader`'s digest links were NOT re-pointed.** The brief asked for
  it; nothing there needed it. Two different things are called "the digest": the
  header's is the RUN's (rewrites, presets, effective options, problems — each
  clause linked to the instrument that explains that number), and the Overview
  is the DESCRIPTION digest. No clause ever pointed at the description card, and
  re-pointing one would send a reader asking "which presets?" to a tab that does
  not answer it. What the header carried was a stale doc comment claiming the
  Overview was retired; that is what changed. No `N behaviors` clause was added
  either — the count already has two homes (the tab badge and the card's own
  pill) and a third would be a number to keep in sync for no new answer.

- **The empty state is a note, not an absent panel.** The 069 card rendered
  `null` when a run had no author prose, which was right for a card in a tab
  full of other things and wrong for a tab of its own: an empty panel reads as
  broken. Nothing renders while the derivation is still in flight (including the
  frame between two runs) — an empty note there would flash "no descriptions" at
  a reader whose config is full of them.

## The review's polish pass

The adversarial conformance review confirmed the artboard walk end to end and
left four gaps plus flags, all closed:

- Two e2e specs still asserted pre-083 facts — the `?` sheet's `1 – 5` digit
  range and `tab=overview` landing on Tests. Both now assert the six-tab truth.
- The tab badge was not reset on a new run: `setOverviewBehaviors(null)` now
  sits beside `setEffectiveStats(null)` in the run-invalidated block, so a
  re-run shows no badge (not the previous run's) until the derivation settles.
- Six tabs outgrew the results column at a 1280px viewport — the sixth wrapped
  onto its own row. The `.tab` sides trimmed from 0.8rem to 0.55rem (labels,
  including Proposal F's "Effective config", stay verbatim), and
  `12-layout-regressions` now pins the one-row strip at the default viewport.
- The panel renders inside the app's `.card`/`.card-title` chrome, not the
  artboard's bare block — the artboard draws the tab body alone, and every tab
  panel here is a card; the smaller title scale is the card grammar's, ledgered
  now rather than silently. (`.overview-card` and `.overview-count` are
  unstyled hook classes for tests, on purpose.)
- The `packageRules[i] — …` citation, previously `title`-only, also rides in a
  `.visually-hidden` span — a tooltip never reaches keyboard or screen-reader
  users, and this tab is aimed at exactly the readers who need the pointer.
- `TOPIC_ORDER` is now derived from a `Record<TopicId, number>` rank table, so
  a future topic missing its slot fails to compile instead of silently deleting
  its rows from `groupByTopic`.
- The old card's now-unrendered model surface was pruned: `descriptionCountText`,
  `groupContributionText` and `DigestGroup.redundant` are gone (the redundancy
  fact lives on as `behaviors: 0`, and the preset tree's `duplicate ×N` badge
  remains the surface that names repeats).

## Deliberate differences kept

- **069's honest extras survive, un-drawn.** The `≈` marks on approximate
  attributions, the degraded caveat, and the non-string footnote (`N members of
the description array are not text…`) are all absent from the artboard and all
  kept. Each is a promise the engine's own self-check makes; a summary that
  quietly drops part of the array it summarizes is what the footnote exists to
  prevent, and the caveat promises that every untraceable sentence is marked —
  including the ones with no preset token to sit beside.

- **The artboard's `… 18 more sentences` row is mock truncation.** The revealed
  tail shows everything it holds. It is the only place the design draws a
  truncation, and it is drawing a shortened mock, not a rule.

## Tests

- `lib/description-topics.test.ts` (unit, new) — all thirteen artboard sentences
  file where the design draws them; eleven real `config:recommended` sentences
  (from `rcd provenance renovate.json description`) file plausibly; match order
  beats display order for the automerge/schedule overlap; `\bpin` does not swallow
  "spring"; case-insensitivity; and `groupByTopic`'s three structural
  guarantees — the design's order, every row kept exactly once in arrival order,
  and no empty headings.
- `features/overview/rows.test.ts` (unit, new) — a repeated sentence is listed
  once and keeps the layer of its FIRST occurrence, merge order survives the
  flattening, a repo rule is an ordinary row carrying its `packageRules[0] — …`
  citation, that such a row counts while `totals.behaviors` does not, and that an
  approximate attribution survives.
- `features/overview/OverviewPanel.test.tsx` (render, new — succeeds
  `components/DescriptionDigestCard.test.tsx`) — the design's copy word for word
  (header, `.pill-count`, the two muted sentences, the footer), a source chip on
  EVERY row with the preset token clickable and the repo chip carrying
  `explained`, the count reported for the badge equalling the count printed, the
  one toggle both ways with the rule row's tooltip, the toggle surviving a
  re-run's empty frame, the honest empty state, `show raw order` gated on a real
  `description` row, and 069's extras (three `≈` marks including the two with no
  token, the caveat, the non-string aside, and the `global` layer's own hue).
- `lib/share.test.ts`, `lib/input-schemas.test.ts` — the strip is six with
  Overview first; `overview` maps to itself; only `rewrites` and `simulator` are
  retired ids; nothing infers the Overview from a pre-028 view.
- `app/keystroke-render.test.tsx` — counts `OverviewPanel` in place of
  `DescriptionDigestCard`. It is the heaviest thing a keystroke must not
  reconcile: it re-derives per-string provenance and re-runs the classifier over
  every sentence.
- `e2e/11-tabbed-shell.spec.ts` — six tabs, Overview first, still landing on
  Tests; the Overview's copy, its first topic title, a source chip on the first
  row, its pill agreeing with its badge, `show raw order` crossing to the
  Effective tab and leaving a `← Back to Overview`; and the tail toggle opening
  and closing.
- `e2e/19-keyboard.spec.ts` — the digit jump shifted by one, which is the point
  of binding by strip POSITION rather than to a frozen digit-to-tab map. The
  arrow-walk specs needed no change: both walk from Presets, whose neighbours are
  unchanged.
