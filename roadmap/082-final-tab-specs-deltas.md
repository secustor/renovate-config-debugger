# 082 — The final tab specs, and the four deltas they still asked for

Milestone: M20 · Status: done (feat/v2)

## What the specs say

Three artboards from the design project, each the FINAL version of a surface an
earlier roadmap had already built most of.

**`Presets Tab Final.dc.html`.** The ledger, with two things the app did not
have. The summary strip reads
`extends resolved 2 sources into 1,103 presets · 0 errors` — three counts and
the way into the tree, and **no per-source tokens**; the error fragment becomes
a red pill the moment the count is non-zero. And the closing health line, when
something failed, becomes a red-tinted BOX: a toggle header (`✗ 2 errors ·
214 repeat occurrences served from cache`, `docs ↗` on the right) over one row
per failed preset — the preset token, the error message, and a right-aligned
"via your preset" / "via extends" note (its mock data is five hosted-preset
failures; a failed top-level entry of the reader's own is a case it does not
draw, and see below for what that gets).

**`Effective Tab Final.dc.html`.** ONE toolbar row holding all four controls —
the `Filter keys…` box, `only overridden`, the By key / As JSON switch pushed
right, then an icon-only copy (`title="Copy effective config as JSON"`, green
check for 1.5 s) — in BOTH views. Under it, one band per deciding layer:
the repo band, a presets band headed with the reader's own top-level extend
(`config:recommended decided 24 options`), each capped with a
`N more — show all` line; and a defaults band that is a collapsed single-line
toggle over INERT rows (no caret, no cascade) closing with
`N more defaults — show all · hover any key for Renovate's docs; no cascade to
show — only the default ever touched these`. A row is key · preview · NOTE —
prose, not chips (`also set by :dependencyDashboard — same value` in warn,
`appended, not overridden`, `5 presets wrote these`). Expanded, it is
`The cascade, bottom to top`: the `✓ final` card FIRST, every losing card's
value struck through, `Per-rule provenance: all 463 rules with their source
preset →` deferred behind its own link, and the blame ledger
(`Who wrote each line (7 lines · 5 presets)`) closing with one combined
`5 more lines · 135 dropped before merging →`.

**`Pin Options.dc.html`**, variant `combined`, `repoAvailable: false`. The
Tests tab's pin card with three tabs — Manual, **Paste JSON**, From repository
(unavailable) — plus, under the Manual tab's field groups, a collapsed
**Descriptor JSON** section: caret, muted title, a bare `result · read-only`
pill, and inside it the descriptor with a copy button and the note "assembled
from the fields above — edit them, not this".

## What already matched

Most of all three, from three earlier passes.

- **The ledger** (075 iteration 5b, tokens standardised in 081) — the strip's
  sentence, one card per top-level source, the mosaic, the option and family
  sections, the docs links, the clean-run health line word for word.
  One correction after review: every source card now starts SHUT. 075 opened
  fetched sources and small built-ins by default (with a "never all shut"
  fallback for the lone-firehose run) — but the final artboard's own state
  starts every card closed (`internalOpen: null, customOpen: null`), and the
  owner confirmed it: the header alone answers the tab's question — the
  source, its counts, its docs — and the body is detail the reader asks for.
  `defaultOpen`, `BIG_BUILT_IN` and the fallback are deleted.
- **The Manual pin form** (079's redesign, 080's always-open Add-a-test box) —
  the quick-fill chips, the sentence card, the derived `updateType` chip, the
  three collapsible field groups with their "N set" pills, Simulate/Pin.

Nothing in those was touched.

**The Effective tab used to be the third bullet here, and that was wrong.** The
retracted claim was "the three decider bands and the cascade already match (075
iteration 5, 069's blame ledger, 051's As-JSON view) — the pills, the
headlines, the `✓ final` marker, the struck-through losing values, the folded
defaults band". An adversarial review against the artboard found twenty
divergences: the toolbar was split across two chrome rows, two of its controls
were not in the design at all, the defaults sat behind a checkbox rather than in
a band, the cascade ran oldest-first with only overwrite steps struck through,
and the row's third cell repeated the chip its own band header carries. What
follows is the correction.

## What changed

- **The Presets health box names the failures** (`features/presets/ledger.ts`,
  `PresetLedger.tsx`). It used to say "N presets could not be resolved" and
  offer the tree — i.e. answer "how many" and send the reader into a 1,100-row
  inventory to find out "which", when the run already knows. `errorRows()` (in
  `ledger.ts`, on the model that is cached per result) walks the tree once for
  every node in state `error`, which is EXACTLY what `TreeSummary.errors`
  counts, so the rows and the headline number are the same walk seen twice and
  cannot drift. Each row carries the standard `PresetName` with its node id, so
  the hover card and the click-to-tree come for free.

  The `via` note is derived, not guessed, and deliberately coarse. **Depth
  decides first**: a DIRECT child of the root is an entry the reader typed into
  their own `extends`, whatever its source kind, and says "**in your config**".
  That case is not in the artboard — which mocks five hosted-preset failures —
  and it is the commonest single-error run there is: a mistyped
  `config:recomended`. Classifying by source kind alone (the first cut of this)
  told its author the name "arrived through a preset's own extends", which is
  flatly false. Below the top level the design's two phrasings apply, decided by
  the top-level entry the failure sits under: a fetched one (github, gitlab,
  local, npm, …) is a preset the reader hosts — "via your preset"; a built-in
  one means the failing reference was written by a preset — "via extends". All
  three wear a `title` stating the claim behind the three words. Nothing finer
  is asserted; the exact chain is what the tree is for.

- **The 009 auth hint survived the rewrite, on the header line.** It is the
  actionable half of a failure ("signing in would reach the private ones" / the
  rate-limit wording) and it now reads with the box still shut, derived from the
  rows' own `authFixable`/`rateLimited` flags rather than from a second walk
  (`collectGithubAuthFailures` keeps its other caller, the run-level banner).

- **The strip lost its source tokens** and gained the error pill. It used to
  list every top-level entry as a `PresetName` that scrolled to its card; the
  cards are directly below, wearing the same names in the same tokens, so the
  strip was a table of contents for a list one screen long. It is counts now —
  `resolved N sources into N presets · N errors` — with the error fragment a
  `.pill-error` when there is one and plain text at zero (a pill reading
  "0 errors" is an alarm about nothing). `focusSource`, the scroll and the
  `motionScrollOptions` import went with it; `ledgerCardId` stays, as the card's
  own stable anchor.

- **The Effective tab's copy button is in the toolbar, in both views**
  (`EffectiveConfig.tsx`). It is the shared `CopyButton` in `iconOnly` mode
  (077's shape), last in the one toolbar row (it was seated in
  `.card-title-actions` beside the view switch until that row was built below).
  Both copies now read `resolvedConfigText()` — a new one-function module,
  `features/effective-config/resolved-json.ts` — so the toolbar's document and
  the As-JSON view's document are the same string by construction.

  The derivation behind it (`useResolvedConfig`) is no longer gated on the JSON
  view. `navigator.clipboard.writeText` has to be called in the click's own
  task (Safari drops a write issued after an `await`), so the document cannot be
  computed on demand; the cost is one extra `computeResolvedConfig` per RUN, in
  an effect, off the critical path — and not per keystroke, since `expand` and
  `includeDefaults` can only be changed from the JSON view.

### The Effective tab, rebuilt to the artboard

- **ONE toolbar row, in both views** (GAP-1/GAP-2). The filter box, `only
overridden`, the view switch (`margin-left: auto`) and the copy now sit in a
  single `.prov-filters.prov-toolbar` row that renders as soon as provenance
  exists — where the switch and the copy used to live in the card title and the
  filters in a separate bordered row that existed only in the By-key view. Two
  controls went with the rewrite: the **`Filter keys by layer` select** and the
  **`show default-only` checkbox**, neither of which is in the design (what the
  checkbox gated is the defaults band now). `contributingLayerIds`,
  `layerOptions` and the `LayerFilterValue` sentinel type went with the select.

- **The presets band is named after the reader's extends** (GAP-3).
  `topLevelPresetNames` + `presetDeciderName` (`decider-groups.ts`, unit-tested)
  read the non-nested, resolved children of the preset tree root — exactly the
  presets the provenance replay gives a layer to — so the headline reads
  `config:recommended decided 24 options`.

- **The defaults band always exists, folded** (GAP-4/GAP-5/GAP-6). Default-only
  rows are no longer filtered out of the view: they are the `defaults` band,
  collapsed by default, and the other bands cannot contain them (the band IS the
  set of keys the defaults decided). Its rows are inert — an empty caret slot,
  the key with its docs hover, a grey code value, no cascade — and it closes with
  the design's footer: `N more defaults — show all · hover any key for
Renovate's docs; no cascade to show — only the default ever touched these`.
  The two "N default-only options hidden" footnotes are gone with the checkbox
  they pointed at.

- **Every band stops at eight rows** (GAP-7), with a `N more — show all` line
  (`N more defaults — show all` in the defaults band). The `max-height`
  scrollers this replaces — `.prov-list`'s 40rem and `.prov-section .prov-list`'s
  32rem — are deleted: a scrollbar inside a scrolling page hides the same rows
  without ever saying how many.

- **The same-value note** (GAP-8), in `features/effective-config/row-notes.ts`.
  A losing step whose value deep-equals the winner's is the one actionable fact
  a row can carry — "this line changes nothing" — and it lived in the chain's
  no-op steps, which every rendering filtered out. The note reads `also set by
:dependencyDashboard — same value` in the warn tone.

- **The third cell is prose, not chips** (GAP-9/GAP-19). `rowNote` produces one
  note per row, ordered by what the reader can act on: the description row's
  `5 presets wrote these`, then the same-value note, then `appended, not
overridden` / `merged, not overridden` / `overridden`. The winning-layer
  `ProvenanceChip` is gone from the row — the band header above it already names
  that layer — and the one-word badge is gone with it, though the notes that
  name a merge behaviour keep its 016 glossary card.

- **The cascade reads winner-first** (GAP-10/GAP-11/GAP-12/GAP-14). The heading
  is `The cascade, bottom to top`; the stack is `chain.toReversed()`, so the
  `✓ final` card leads and the Renovate default is last; EVERY losing card's
  value is struck through and muted (`.prov-losing`), not only the overwrite
  steps; and the leading `Final value` block is gone, because the winner card
  already prints it.

- **No-op steps are cards again.** The stack renders the whole chain, filtering
  nothing. The design's own example (`Renovate defaults → :dependencyDashboard
→ repo config`) is three cards, and the middle one is a no-op in the engine's
  model — "the default was `false` and a preset set it to `true`" is the answer
  even when the default changed nothing. The defaults card's verb is the
  design's `defaults to` rather than `sets`.

- **The per-rule table is deferred** (GAP-13). An expanded `packageRules` row
  shows `Per-rule provenance: all N rules with their source preset →`; the 463
  rows render on click, in local state so collapsing the row forgets it.

- **The blame ledger counts lines and closes once** (GAP-15/GAP-16). The heading
  is `Who wrote each line (7 lines · 5 presets)` and the collapsed row's preview
  is `7 strings — "…"` (two functions, `ledgerCountText`/`ledgerStringCountText`
  — the row describes a VALUE, the ledger counts its own rows). The cap is the
  ledger's, applied across the runs in order so what is shown is always a PREFIX
  of the final array, and one button — `5 more lines · 135 dropped before
merging →` — reveals both the rest and the dropped section, replacing the
  per-run "show all" buttons and the `Not included:` disclosure (whose sentence
  survives as the revealed list's heading).

- **A row can show both its ledger and its cascade** (GAP-17). They answer
  different questions — who wrote each sentence, and how the array was
  assembled — and the exclusive `ledger ? … : …` hid the second one on the only
  row that has both.

- **The Tests tab has a Paste JSON tab** (`AddTestBox.tsx`,
  `paste-descriptor.ts`). The descriptor a reader can already get their hands on
  is the one Renovate's own debug log prints under `packageFiles with updates`,
  and retyping its eight fields into the sentence is the step this removes.
  `parsePastedDescriptor` is pure and unit-tested: it keeps the string-valued
  keys this form has a field for, COUNTS everything else (a log entry carries a
  dozen keys the simulator has no meaning for, and a reader who is not told they
  were dropped will believe the simulation saw them), and returns the receipt
  the Manual tab then wears — "✓ Imported 4 fields from pasted JSON · 1 unknown
  key ignored".

  Two honest departures from the artboard's `KEYS` map, both because this form
  has more fields than the artboard's mock state did. `depName` fills the form's
  OWN `depName` — Renovate matches on both names, and a descriptor whose two
  differ is exactly the case worth simulating — and additionally fills
  `packageName` when the paste carries none, which is the fallback the map
  encodes. And a paste REPLACES the descriptor rather than patching it: merging
  it over whatever a quick-fill chip left behind would carry a stale
  `packageFile: package.json` into a Dockerfile descriptor without saying so.
  `updateTypeTouched` follows the paste, so an `updateType` the log stated is
  not silently re-derived from the versions. The draft itself lives in
  `AddTestBox` (as `pasteDraft` does in the artboard's own state), because the
  panel unmounts on a tab switch and a local `useState` would throw a pasted
  descriptor away the moment its author looked at the form it filled.

- **The compact form gets the descriptor back, folded away**
  (`DescriptorPreview.tsx`, `descriptor-json.ts`). 079 gave the compact form no
  preview at all — the panel is narrow and the pin card is the receipt — but the
  final artboard asks for the document, because it is what a reader pastes into
  an issue or hands to `rcd simulate`. Collapsed it costs one 0.78rem row.

  The key order and the omit-what-is-unset rule moved into
  `descriptor-json.ts`, which both the standalone aside and the new section
  render from, and whose `descriptorJsonText` is assembled from the very lines
  that are rendered — so the clipboard cannot hold a different document from the
  screen.

  **And the block prints the whole descriptor now.** 079's preview showed a
  fixed eight keys; `toDescriptor` sends nineteen, every one of them editable in
  the form this block sits under, and the footer says "assembled from the fields
  above". A `sourceUrl` that decides the verdict (it was the decisive matcher in
  two of the persona study's three problems) must not be missing from the thing
  that calls itself the descriptor and gets handed to `rcd simulate`. The order
  is the familiar eight first, then the rest in the order the form's groups
  introduce them, then anything the engine's descriptor type grows that this
  list has not been taught — at the end rather than silently nowhere. Array and
  boolean values print as JSON and do NOT wear the string colour. The standalone
  aside gains the same rows, which is the correction reaching it too.

- **The From-repository tab adopts the spec's unavailable state**: the inline
  hint reads `sign in required` rather than `soon`, and the title is the
  design's "Sign in with GitHub or load a repo to pick from detected
  dependencies". It stays `disabled` — `.tab:disabled` already carries the
  faint ink and the `not-allowed` cursor.

## The Effective tab's judgment calls

- **The row filters apply to the By-key view only, and are DISABLED (not
  hidden) in As JSON.** The design's row is one row in both views, so they stay
  on screen; what they must not do is narrow the document, because that document
  is a copyable artifact and the toolbar's own button hands it to the clipboard
  under the title "Copy effective config as JSON". A filtered copy would be a
  config that is not the config. Disabled with a `title` saying why beats an
  enabled control that silently does nothing.

- **Multiple top-level extends give `first +N more decided …`.** There is no
  single line to name, and naming only the first would credit it with what the
  others decided. `presetDeciderName` names the first and counts the rest;
  with no resolved top-level preset the generic `Presets decided N options`
  stays.

- **One truncation cap, eight rows, for every band.** The artboard's per-band
  counts (repo 4, presets 3, defaults 8) are its mock data, not a rule. Bands
  hold whatever a config produced, and a cap that differed by band would be a
  rule the reader has to learn instead of a list that stops.

- **A band header counts the rows it is SHOWING.** GAP-20 removed the
  `N of M shown` pill along with the layer filters that made it necessary, so a
  header quoting a pre-filter total would be the one number in the view the
  reader cannot check. Under a key filter the presets band says "decided 1
  option" and shows one; `countByDecider` is deleted.

- **The defaults rows have no note column.** The artboard's per-option prose
  ("when PRs are opened", "schedules use UTC") is mock copy for a mock config —
  the run knows nothing of the sort, and inventing it per option is exactly the
  kind of confident sentence this app must not print. The honest sentence about
  all of those rows is the band's footer, which is why the footer says it once.

- **`ignorePaths` still previews as `[ 8 items ]`, not `[ 8 globs ]`**
  (GAP-18). `valuePreview` is shared with the Presets ledger, and the noun would
  have to come from a hand-written per-option map: Renovate's option metadata
  says `type: array, subType: string` for `ignorePaths` and has no notion of a
  glob. A map maintained by hand is a second source of truth about Renovate's
  options that nothing can check, and it drifts silently. The generic noun is
  less charming and cannot be wrong.

- **The same-value note names the DEFAULTS layer too.** `also set by default —
same value` on a line the reader wrote is the same finding as `also set by
:dependencyDashboard — same value`, and it is the one Renovate's own docs ask
  for ("don't restate the defaults"). Several layers agreeing are named as
  `first +N more`.

- **The bands stay disclosures; only the defaults band starts shut.** The
  artboard draws the repo and presets band headers as plain headings and only
  the defaults band as a toggle. 075 made all of them `<details>` — once one
  group collapses they all must, or the affordance reads as an oddity of that
  group — and the defaults band's `<details>` IS the design's collapsed
  single-line toggle bar expanding in place. Keeping the other two collapsible
  costs a caret and keeps one grammar.

The confirming review's residuals were closed in a polish pass: the band
headline now carries the design's three emphases (lead in the header's ink at
600, the count in the band's hue via `--prov-section-hue`, the trailing clause
muted at 400 — the defaults header all-muted), `deciderHeadline` returning the
three parts instead of one string; the row preview is set in the running sans
(much of it is prose) with only the defaults band's value cell in mono, per the
artboard's `span` vs `code` split; the toolbar row is borderless like the
design's (the bordered band boxes below it carry the separation); the note
column wears the design's `white-space: nowrap`; and the defaults footer
regained the space its `· hover any key…` separator lost to JSX whitespace
stripping.

Two more calls from that pass:

- **The card title stays.** The artboard's frame begins at the toolbar row;
  `Effective config — grouped by …` is the app shell's card grammar, which
  every tab has. Removing it here would make this card the odd one out to
  satisfy a frame the artboard simply doesn't draw.

- **A band a filter empties disappears, defaults included.** The artboard
  draws the defaults band unconditionally, but it draws no filters either; once
  the key filter or "only overridden" is narrowing rows, an empty band held
  open just to exist would be a heading with nothing under it. Bands render
  whatever the filter leaves.

- **The glossary note keeps its `tabIndex` inside the row button** — carried
  over from the badge it replaced, and interactive-inside-interactive is not
  markup to be proud of; fixing it means moving the third cell out of the
  row-head button, which is a row-structure change for another pass, not a
  silent tweak inside this one.

## Deliberate differences kept

- **The From-repository picker is still deferred, pending 063/078.**
  _(Since lifted: [087](087-ghost-row-and-repo-deps.md) shipped the picker over
  the loaded repository, with the tablist semantics promised below.)_ It needs
  dependencies extracted from real package files, which the browser engine does
  not do yet; the artboard's own `repoAvailable: false` state is what the app
  renders, so the tab is visible, honestly labelled and honestly inert. When 078
  lights it up, the tab strip also gets real tablist semantics (there is no
  arrow-key roving today, so `role="tablist"` would promise keyboard behaviour
  that isn't there — and would collide with everything that addresses the
  results strip by role).

- **The ghost variant is not adopted.**
  _(Reversed later: [087](087-ghost-row-and-repo-deps.md) adopted the ghost
  row once pins exist — the ruling below stands as the record of why 082
  didn't.)_ `Pin Options` offers four variants and
  its DEFAULT is `combined` — the always-visible tabbed card — which is exactly
  what 080 built. The `ghost` variant's collapsed "+ Pin a dependency…" button
  would put a click in front of the tab's primary action to save a card that is
  already at the foot of the list.

- **The health box's tint is the palette's, not the artboard's 4%.** The design
  writes `rgba(207,34,46,0.04)` over a 40%-red border; the app has one
  background step (10%) and one border step (40%) per status hue precisely
  because those had drifted across 7/10/12/16%, so the box wears `--error-bg` /
  `--error-border` like every other error surface. The divider between header
  and rows is a `color-mix()` of `--error`, which the artboard's 25% asks for
  and the token system allows.

- **The copy buttons keep the app's copy affordance, accent and all.** The
  artboard's toolbar button is muted at rest; `.copy-btn` (036/039) is accent.
  One copy affordance at one size is a standing rule here, and a toolbar copy
  that looked unlike every other copy in the app would be the inconsistency the
  rule exists to prevent. The copied state (green wash, check icon, 1.5 s) is
  already the design's.

- **The toolbar copy appears when the document does**, rather than sitting
  disabled while it is derived. It mirrors the As-JSON view's own copy, which
  has waited on `getText` since 051, and the window is one effect long.

- **The Paste tab reports bad JSON instead of no-opping.** The artboard's
  `parsePaste` silently `return`s on a parse error. A button that does nothing
  is indistinguishable from one that is broken, and a half-copied log line is
  the commonest paste there is — so the tab prints one line in the form's
  existing `.sim-empty-guard` grammar and nothing more.

- **The import note counts two kinds of ignored key, and says which.** The
  artboard's counter buckets everything it did not take as "M unknown keys
  ignored", including a key the form KNOWS whose value it cannot hold (`depType:
["dependencies"]`, a numeric version) — and calling `depType` unknown while
  the form is showing a `depType` box reads as a bug in the parser. An ordinary
  log paste still gets the design's sentence verbatim; only when an unusable
  value turns up does the clause become "N keys ignored (M not a string)". The
  note is also pluralised throughout (`1 field`, `1 unknown key`), which the
  artboard's plural-only template is not.

- **The tab strip carries `aria-pressed`.** `role="tablist"` is still declined —
  there is no arrow-key roving, and the results strip owns that role — but two
  buttons that differ only by a CSS class are two identical buttons to a screen
  reader. `aria-pressed` states which panel is on screen without promising
  keyboard behaviour that isn't there.

- **The As-JSON view keeps its own labelled copy** next to the new toolbar icon.
  They are two rows of the same document (both `resolvedConfigText`), and that
  is deliberate: the toolbar copy is the tab-wide affordance the design asks
  for, while the labelled one sits in the options row it belongs to — beside
  the "Expand presets" and "include defaults" controls that decide what the
  document CONTAINS, where "copy this thing I just configured" is the end of a
  sentence rather than a second button.

- **`ledgerCardId` survives with no internal consumer.** 082 removed the strip
  scroll that used it; `LedgerCard` still stamps the id, because a stable
  per-source DOM anchor is what any future deep link (or an e2e selector) needs
  and re-deriving it later would mean re-deciding its shape.

- **The Descriptor JSON section is compact-only.** The standalone simulator has
  a column for the live aside and already shows the same document there; two
  copies of it in one form would be a second answer to the same question.

- **The standalone aside scrolls past a viewport's worth of fields.** The
  full-descriptor correction removed the eight-row cap that made the aside's
  `position: sticky` safe, so it now carries `max-height: calc(100vh - 1rem)`
  with its own scrollbar — a form with many advanced fields set keeps every row
  reachable instead of pinning the tail off screen.

## Tests

- `features/presets/ledger.test.ts` (unit) — the error rows: all three `via`
  phrasings from real tree positions (including a mistyped top-level built-in),
  the auth flavors (not-found and rate limit), that the rows and
  `summary.errors` agree, and the clean-run empty case.
- `features/presets/PresetLedger.test.tsx` (render) — the health box itself,
  over a hand-built tree, because an offline run fetches nothing and therefore
  fails at nothing: the count and docs link readable while shut, the caret
  opening the rows, the row's token calling `onOpenNode`, the auth hint present
  and — in the mistyped-entry run — correctly absent, and the strip's
  `.pill-error`.
- `features/simulator/descriptor-json.test.ts` (unit) — the print order, that
  advanced fields (`sourceUrl`, `registryUrls` as the ARRAY Renovate receives)
  and the `isBump` flag appear, that both names survive, and that the copy text
  is exactly the rendered lines.
- `features/simulator/paste-descriptor.test.ts` (unit) — the happy path over a
  log-shaped object with unknown keys, the `depName` → `packageName` fallback
  (and that both survive when both are given), a known key with a non-string
  value counted apart from an unknown one (with the note it produces), the three
  failure messages, and the note's singular/plural.
- `features/simulator/TestsPanel.test.tsx` (render) — the whole Paste-JSON
  wiring over a real run: `aria-pressed` on the strip, the invalid-JSON line,
  a paste landing back on the Manual tab with the receipt and the fields
  filled, the Descriptor JSON section printing both names, and the draft
  surviving a switch back to the Paste tab.
- `features/effective-config/EffectiveConfig.test.tsx` (render) — the toolbar
  copy is reachable from the By-key view and stays put in As JSON, beside that
  view's own labelled copy; the single toolbar row with the two retired controls
  gone and the two surviving ones disabled over the document; the always-there
  defaults band (folded, inert rows, capped at eight, its footer note and its
  "show all"); the presets band named after the extend; a band header counting
  what it shows; the same-value warn note with no layer chip beside it; and, on
  one expansion of `packageRules`, the cascade heading, the winner-first order,
  `.prov-losing` on every other card, the absent `Final value` block and the
  deferred per-rule table.
- `features/effective-config/row-notes.test.ts` (unit, new) — the same-value
  derivation over hand-built chains: the design's `:dependencyDashboard` case,
  several layers counted as `+N more`, structural (not reference) comparison,
  silence when the layers genuinely disagreed, and the prose for each merge
  behaviour.
- `features/effective-config/decider-groups.test.ts` (unit) — `countByDecider`'s
  test is gone with it; added: the top-level names (nested and failed presets
  skipped), the `+N more` naming, and each band headline.
- `features/effective-config/description-ledger.test.ts` (unit) — lines vs
  strings, the global cap keeping index order, and the one combined reveal
  sentence in all four of its shapes.
- `features/effective-config/BlameLedger.test.tsx` (render) — one click reveals
  the held-back lines AND the dropped list, and spends the offer.
- `e2e/15-resolved-config.spec.ts` — the filter input is disabled over the
  As-JSON document rather than absent. `e2e/helpers.ts` gains
  `effectivePresetChip`, which expands a preset-band row first: the clickable
  chip lives in the cascade now, so the four cross-link specs
  (`11-tabbed-shell`, `19-keyboard` ×3, `20-presets-ledger`) reach it the way a
  reader does.
- `features/presets/PresetsPanel.test.tsx` and
  `e2e/20-presets-ledger.spec.ts` updated for the strip: it counts the sources
  and no longer tokenises them, and the folded built-in opens from its own
  header rather than from a strip token.
