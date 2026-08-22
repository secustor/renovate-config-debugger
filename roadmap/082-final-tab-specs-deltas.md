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

**`Effective Tab Final.dc.html`.** An icon-only copy button in the toolbar,
right after the By key / As JSON switch, `title="Copy effective config as
JSON"`, visible in BOTH views, flipping to a green check for 1.5 s.

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
- **The Effective tab's three decider bands and the cascade** (075 iteration 5,
  069's blame ledger, 051's As-JSON view) — the pills, the headlines, the
  `✓ final` marker, the struck-through losing values, the folded defaults band.
- **The Manual pin form** (079's redesign, 080's always-open Add-a-test box) —
  the quick-fill chips, the sentence card, the derived `updateType` chip, the
  three collapsible field groups with their "N set" pills, Simulate/Pin.

Nothing in those was touched.

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
  (077's shape), seated in `.card-title-actions` right after the view switch.
  Both copies now read `resolvedConfigText()` — a new one-function module,
  `features/effective-config/resolved-json.ts` — so the toolbar's document and
  the As-JSON view's document are the same string by construction.

  The derivation behind it (`useResolvedConfig`) is no longer gated on the JSON
  view. `navigator.clipboard.writeText` has to be called in the click's own
  task (Safari drops a write issued after an `await`), so the document cannot be
  computed on demand; the cost is one extra `computeResolvedConfig` per RUN, in
  an effect, off the critical path — and not per keystroke, since `expand` and
  `includeDefaults` can only be changed from the JSON view.

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

## Deliberate differences kept

- **The From-repository picker is still deferred, pending 063/078.** It needs
  dependencies extracted from real package files, which the browser engine does
  not do yet; the artboard's own `repoAvailable: false` state is what the app
  renders, so the tab is visible, honestly labelled and honestly inert. When 078
  lights it up, the tab strip also gets real tablist semantics (there is no
  arrow-key roving today, so `role="tablist"` would promise keyboard behaviour
  that isn't there — and would collide with everything that addresses the
  results strip by role).

- **The ghost variant is not adopted.** `Pin Options` offers four variants and
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
  view's own labelled copy.
- `features/presets/PresetsPanel.test.tsx` and
  `e2e/20-presets-ledger.spec.ts` updated for the strip: it counts the sources
  and no longer tokenises them, and the folded built-in opens from its own
  header rather than from a strip token.
