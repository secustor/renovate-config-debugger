# 081 — One preset name, one preset hover

Milestone: M20 · Status: done (feat/v2)

## What the spec says

Two rows of the design project's `Standard Components.dc.html`.

**Preset names.** Every preset reference wears the same purple token —
`var(--font-mono)`, **0.78rem**, `#8250df` text on an 8%-purple fill inside a
25%-purple 1px border, 4px radius, `0.02rem 0.35rem` padding. Inert references
are `<code>`, clickable ones are `<button>` with identical metrics whose hover
darkens the border to full purple. The rule under the row is the whole point:

> whether it names a built-in, a custom preset, or links to its detail. **Purple
> = preset, everywhere.**

**Preset hover.** Hovering any preset token opens a 300px card after **0.4s**
(also on keyboard focus): a raised surface, `var(--border)` hairline, 8px
radius, popover shadow, `0.7rem 0.85rem` padding, holding three things.

1. The "via" chain at 0.74rem — muted "via", layer chips, muted `→`
   separators, ending in italic purple "this preset" at 0.72rem. **The token
   never repeats its own name.**
2. A `border-top` rule, then 0.74rem muted: "extends **3 presets** directly,
   **21** after nesting · deepest chain 3 levels", numbers in ink `<strong>`.
3. A quiet underlined accent link at 0.72rem: "show the full tree →".

The card is hoverable; it dismisses on mouse-out, Esc, or scroll.

## What was there

The hue was already right and nothing else was. `.preset-token` (075) set no
`font-size`, so the token was whatever surrounded it — 0.85rem in a ledger
header, 0.7rem in a digest row, 0.95rem in the detail heading — which made
"the same token everywhere" true of the colour alone. The class was
copy-pasted at six call sites, **none** of which had a hover card, and three
more surfaces named presets in three other ways: a muted mono `<button>` with
a `title` (the description digest's leaf label), a bare `<code>` in prose (the
tree's origin framing), and a descendant-selector size override
(`.preset-panel-head .preset-token`).

## What changed

- **`components/PresetName.tsx` is the token, and the only writer of the
  class.** `<button>` when it acts, `<code>` when it does not — `<code>`
  deliberately, because several inert tokens render inside another button (the
  ledger's card-header toggle, a rule-family row) where a nested button is
  invalid HTML. A `heading` prop carries the one size variant (0.95rem/600, the
  detail panel's title) through the component's API instead of through a
  descendant rule, and `noCard` suppresses the hover on the one token that is
  already the thing the card previews.

- **`components/PresetReferenceCard.tsx` is the card**, decomposed a component
  per line because `react/jsx-max-depth` is 3 and the chain alone is a row of
  chips with separators. Its chips ARE the standard `.pill` (`.pill-accent` for
  the repo layer, `.pill-preset` for an ancestor preset), restyled inside the
  card to mono/0.68rem/400 — the chain carries preset NAMES in running text, so
  it is context rather than a claim.

- **`lib/preset-reference.ts` derives what the card says**, pure and unit
  tested: the root-first ancestry ending at the node's PARENT (never the node),
  plus the three numbers. It reads the one per-run walk, which now exposes two
  more per-node fields (`preset-tree-stats.ts`): `descPresets` — every
  descendant whatever its state, not `descResolved`, because the card sits next
  to a link into a tree that has a row for the errored and ignored ones too —
  and `subtreeDepth`, the deepest chain below the node.

- **`components/preset-reference-context.ts` carries the two things that are
  the same at every site**: the run's tree and App's `selectPresetNode`. By
  context, not by props: tokens sit several components deep inside cards that
  were handed a summary model rather than the tree (a ledger option row knows a
  setter's node id and nothing else), and threading a `PresetNode` root through
  all of them would put the whole tree in every intermediate signature — where
  the first component to forget it loses the card silently instead of failing
  the build. The CLICK handler stays a prop, because it genuinely differs (the
  ledger strip scrolls to a card, an option row jumps to the tree). Installed
  once, in `ResultsColumn`, memoized on the two per-run identities so the 032
  keystroke render counts are untouched.

- **A hover-INTENT delay, opt-in.** `useMoveGatedHover` takes a `delayMs`
  (default 0) and `HoverCardAnchor` an `openDelayMs`; only `PresetName` passes
  one, `HOVER_INTENT_DELAY_MS = 400`. See the ledger below for why it is not
  global. The delay is the POINTER's only — a focus is already an explicit act,
  and making a keyboard user hold a stop for four tenths of a second before the
  card they Tabbed to appears would be a delay with nothing to prevent.

- **Adopted at every site**: the ledger summary strip, the family samples and
  the family row head, the ledger card header, the ledger option row's setter,
  the preset detail heading, the description digest's leaf label, the two bare
  `<code>`s in the tree's origin framing, the rule-framing aside's top
  contributor (`components/rule-framing.tsx` — live in the simulator's heading
  and the effective config's `packageRules` preview), and the blame ledger's
  "via ⟨extend⟩" note. Two `title` tooltips died with it — the option row's
  "Show this preset in the resolution tree" and the leaf label's "Written by X
  — show it in the preset tree" are both the card's own link now, and a tooltip
  racing a card is exactly the inconsistency this pass removes.

  Both late adoptions needed a node id that was being thrown away one line
  earlier, and both got it for nothing: `computeRuleFraming` groups
  contributors by preset NAME and now keeps the first occurrence's `nodeId`
  (which is the node the tree lands on anyway — later occurrences are
  `duplicate` rows served from its cache), and `viaNoteText` became
  `viaNoteRef`, returning the reference instead of the sentence "via X". The
  rule for whether there IS a via note stays in the wording module; the one
  preposition in front of it is prose and moved into the component.

- **`--accent-purple` gained a dark half**: `light-dark(#8250df, #ab7df8)`, the
  design sheet's own dark preset colour. It was the last accent in the palette
  still stated as a single literal while `--accent`, `--muted` and
  `--accent-pink` all carried one — tolerable while it tinted three badges,
  not once 081 made it the hue of every preset token, pill and rule in the app
  (#8250df is ~3.0:1 on `--surface` in dark). Every consumer is either the bare
  token as TEXT, where contrast strictly improves, or a `color-mix()` of it
  (the `.preset-name.described` dotted underline at 65%, `.pill-preset`'s
  currentColor tint, the digest and ledger left rules, the mosaic tile fills) —
  and a mix scales with its hue, so those lighten with the theme instead of
  sinking into it.

- **Dead CSS removed**: `.desc-digest-leaf` (the digest's private mono label,
  now the token plus a `.desc-digest-attr` wrapper that keeps only the
  right-hand placement) and `.preset-panel-head .preset-token`.

## Deliberate differences kept

- **The preset tree's rows do NOT become tokens, and do not get the standard
  card.** `TreeRow` and `PresetListPane` keep `.preset-name` — 0.85rem,
  transparent, state-tinted.

  A row is not a REFERENCE. Every token this pass standardises points AT a node
  from somewhere else — a strip, a ledger cell, a sentence — and the card
  answers the question that gap creates: how did I get here, and what am I
  about to walk into. A row does not point at a node; it IS the node, already
  in the destination view, at the depth and with the state badges the card
  would otherwise have to summarise. The framing test is "does this name refer
  to something not on screen", and the tree row is the one place where the
  answer is no. (`OriginFraming` sits inside the same card and DID take
  tokens — correctly: its names are references in prose that select a specific
  node, which is exactly the case that earns a card.)

  The cost seals it: the tree renders ~1,100 windowed rows at
  `config:recommended` scale, and 1,100 anchors each holding an intent timer
  and a portal is paid by every reader for an affordance answering a question
  they have already navigated past. The `render` project counts panel
  re-renders on keystroke precisely because this surface is where that budget
  gets spent.

- **A leaf's counts line diverges from the sheet's wording.** The design shows
  "extends **3 presets** directly, **21** after nesting · deepest chain 3
  levels", which is the shape of a big built-in. Rendered literally on the
  commonest node in the tree it reads "extends 0 presets directly, 0 after
  nesting" — three numbers to say one thing, and a "deepest chain 1 level"
  clause that measures nothing. So a node with no `extends` says "extends
  **nothing** — a leaf of the expansion" instead, and the depth clause is
  suppressed at ≤1 level. Same facts, same grammar, one honest sentence rather
  than a template with zeroes poured into it.

- **`NodeDescriptionCard` keeps the tree row's name to itself.** The two hovers
  never meet, and that is the design rather than an accident: description facts
  hang off a node's identity (what this preset wrote), so they belong on the
  row that IS the node; the standard card explains a reference (how you got
  here, what it drags in), so it belongs on tokens that point at nodes. If the
  two ever land on one element, the answer is to merge the description lines
  INTO the standard card as a fourth block rather than to stack two cards — but
  no surface asks for that today, so nothing was built for it.

- **`ProvenanceChip` stays a pill.** It names a merge LAYER, not a preset
  reference, and the sheet has a separate "Pills" row for it; its glossary hover
  explains merge order, which is a different question from what a preset
  expands into. Converting it would make "purple = preset" false in the one
  place the app currently uses colour to say "this is where the value came
  from".

- **Scroll: the shared machinery is unchanged.** The spec says dismiss on
  scroll and `useHoverCard` does, with one carve-out — a scroll within
  `SHOW_SCROLL_GRACE_MS` of the show RE-ANCHORS instead, because that is the
  browser's own `scrollIntoView` when Tab lands on a partly-visible anchor, and
  hiding there made every such anchor unreachable by keyboard (069's review
  found it; `hover-card-hooks.test.tsx` pins both directions). A reader's
  scroll always dismisses. Per-card scroll behaviour was rejected: the
  singleton, the Escape arbitration and the grace are one interaction contract,
  and a second copy of it is a second contract.

- **The 0.4s delay is per-anchor, not global.** Glossary terms, the described
  tree row and the attribution card are marked, isolated affordances the reader
  aims at, and a delay there is latency with nothing to prevent. A preset token
  is one of a whole strip of them inside a sentence, where opening on contact
  flickers a card per token as the pointer crosses the line. Same mechanism,
  different anchors; the default stays 0, so no existing card changed feel.

- **The via chips are inert.** The card offers exactly one action, into the
  destination it is a preview of. Making each ancestor chip its own jump would
  put up to four competing navigations in a 300px card the reader is only
  passing through.

- **A pointer-opened card is not Escape-dismissable, and that is 068's ruling,
  not an oversight here.** The spec says "dismiss on mouse-out, Esc, or
  scroll"; the first and third hold everywhere, the second only while the
  anchor has FOCUS, because Escape is handled by the anchor's own keydown. So
  the inert `<code>` tokens — which are deliberately unfocusable, being inside
  other buttons — can only be opened by pointer and only be dismissed by
  pointer or scroll.

  A window-capture listener in `useHoverCard` would close the gap in ~15 lines,
  and I did not add it, because `hover-card-hooks.ts` already argues the
  opposite case at length and the argument is right: a hover card deliberately
  does NOT join the 068 escape ladder, since "registering this card as a layer
  would make it a stack entry that pushes and releases on every hover, and
  Escape would then dismiss a card the pointer merely rested on instead of the
  pill the user is looking at". A window listener is that same behaviour
  reached by a different route — it would have to fire in CAPTURE to beat the
  ladder's document listener, so it would claim Escape ahead of everything for
  every card the pointer has grazed. Overturning a ruling that two prior
  reviews converged on is not this pass's business, and the practical loss is
  small: every CLICKABLE token is focusable, so the keyboard path — the one
  Escape serves — already works everywhere it can be reached.

- **The card's shadow is `--shadow-popover`, not the sheet's literal.** The
  sheet writes `0 8px 24px rgba(31,35,40,0.12)`; the token is
  `0 8px 24px light-dark(rgba(140,149,159,0.3), rgba(0,0,0,0.5))` — same
  geometry, a tuned alpha and a dark half. The card rides the shared
  `.option-card` plane by design, and a popover that shadowed differently from
  every other popover would be the exact inconsistency this pass exists to
  remove. Raw color literals are also a lint error here.

- **`DescriptionAttribution` keeps its own grammar.** Its card prints a
  `›`-joined import PATH and a static preset badge — a different sentence from
  the "via" chain (a path the reader reads, not chips they navigate), designed
  in 069 PR 5 and unchanged since. The two say related things and should
  probably converge, but merging them is a redesign of that card's content, not
  a token swap; it is a future pass, deliberately not smuggled into this one.

- **`LedgerMosaic` tile labels stay plain.** A tile is a proportional area in a
  density visualisation — its label sizes and truncates with the tile, and
  purple-tokenising it would put a 0.78rem fixed-metric box inside a thing
  whose whole job is to be a share of the total. The tiles select a section;
  the section's rows carry the tokens.

- **`drop-reasons.ts` keeps its embedded `<code>`.** One of its three reasons
  reads "muted by \`X\` — its `overrideDescription` replaces every description
  it resolved": a preset name mid-clause in an explanatory sentence assembled by a
  wording module (which also owns the `≈` hedge and the label/why split, and is
  rendered through `CodeText`). Splitting that sentence into JSX to tokenise one
  name would move presentation into the wording layer — the opposite of the
  split that module exists for, and the row already carries a `ProvenanceChip`
  naming the same preset. `viaNoteRef` went the other way because there the
  name IS the payload ("via" + a reference), not a name that happens to fall
  inside a sentence.

- **The CodeMirror preset hover aligns its name and nothing else.**
  `platform/editor-schema.ts` builds vanilla DOM on a lazily-imported chunk, so
  it cannot render `PresetName` — but it can wear the class, and the design rule
  is about the token, not the React tree. Its title is now
  `preset-token preset-token-heading`, i.e. the same treatment the detail panel
  gives a preset name. The rest of that card (its own prose, its own jump) is
  left alone: rebuilding the via chain and the counts in imperative DOM would be
  a second implementation of this card, which is what the pass exists to stop.

## Tests

- `lib/preset-reference.test.ts` (unit) — the chain for a root-level and a
  three-deep preset, that it never contains the node's own name, the three
  counts, the leaf case, the root/unknown null cases, and the two new
  `computeTreeStats` fields (including that `descPresets` counts the errored
  descendant `descResolved` drops).
- `components/PresetName.test.tsx` (render) — both token shapes, that the inert
  one is not focusable, the 0.4s intent delay in both directions (opens at the
  boundary, dropped by a mouse-out), focus opening without it, the chain and
  counts reaching the DOM, the own-name rule, and that the tree link closes its
  card before navigating.
- `components/DescriptionDigestCard.test.tsx` updated where the leaf label
  changed shape: it is found by class rather than by the `title` it no longer
  has, and the approximate run now carries three `≈` marks — the labelled row's
  mark moved out of the name prefix and next to the token. (Both the card and
  this suite were deleted by 083, which regrouped the digest by topic as
  `features/overview/OverviewPanel.tsx`; the token adoption survives there.)
- `features/effective-config/description-ledger.test.ts` updated for
  `viaNoteText` → `viaNoteRef`: the three cases it pinned (nested writer, the
  extend that IS the writer, a non-preset layer) are unchanged, asserted on the
  reference rather than on the assembled sentence.

## Addendum — 2026-08-23: the blame ledger's via note is gone

The "via ⟨extend⟩" note was 081's way of putting two presets in one ledger
cell — the chip for the writer, the token for the extend that carried it in.
User ruling (and what the Effective Tab Final artboard had drawn all along:
one pill per line, no via): the note duplicates the standard hover card, whose
first section IS the via chain, so `LedgerSource` now renders the writer as
the standard `PresetName` token — the Overview `RowSource` pattern, hover card
and click-through included — and nothing else. Non-preset writers keep their
`ProvenanceChip`. `viaNoteRef` and its test died with the note;
`duplicateNoteText`'s "X resolves it again" stays, because a repeat's cell has
no writer token whose hover could carry that fact.
