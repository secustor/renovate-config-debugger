# ARIA audit, and what replaced the four blanket lint offs

Two questions, one answer. The first was "what is the actual state of ARIA in
this app". The second was "why are four `jsx-a11y` rules switched off, and can
the setup be changed so that fewer things have to be".

They turn out to be the same question, because the reason the app's worst ARIA
defect survived review is that it was sitting inside a rule that had been
switched off as "wrong about this codebase".

## What the four offs were hiding

`jsx-a11y` arrived with 18 hits across four rules, and the previous pass read
them as one uniform verdict — "these rules do not understand the patterns this
app uses" — and wrote four `"off"` lines. Re-running them and reading every
site individually gives a different split:

| rule                           | hits | what they actually were                         |
| ------------------------------ | ---- | ----------------------------------------------- |
| `prefer-tag-over-role`         | 9    | 1 real defect, 8 widget-specific exceptions     |
| `no-noninteractive-tabindex`   | 4    | 1 real defect (4 copies of it)                  |
| `control-has-associated-label` | 3    | 3 hits of a rule that ships the option for them |
| `interactive-supports-focus`   | 2    | 2 exceptions, no option that expresses them     |

So of the four offs: one was suppressing a real bug, one was suppressing a real
gap, one was a config line that had not been written, and only one was what all
four claimed to be.

### The defect the off was hiding

`PresetListPane`'s table view claimed `role="table"`. It was not one. Its
children were the two virtual padding spacers and a flat list of `<button>`s —
no `row`, no `cell`, no `rowgroup` anywhere under it — and the header row that
did carry `role="row"` was not even inside it, because it sits outside the
scroll container so it does not scroll away. That is a `role="row"` with no
owning table, and a `role="table"` with no rows.

AT announced "table, 0 rows" over a list that visibly had hundreds. That is
worse than no role at all: an absent role degrades to a list of buttons, which
is exactly what the thing is, whereas the false one actively misinforms.

`prefer-tag-over-role` pointed straight at it. The previous read — "a `<tr>`
requires a real `<table>`, which the virtualized preset tree is not" — is a
true sentence, and the conclusion drawn from it was backwards: it is the reason
the `role="row"` was invalid where it stood, not a reason the rule was wrong.

Both roles are gone. `role="tree"` stays on the tree view, which is correctly
built out of `role="treeitem"`.

### The gap the other off was hiding

The hover-card anchors — every glossary term, every option name, every JSON
`description` — were `<span tabIndex={0}>` with no role and no relationship to
anything. A screen reader landed on one, announced the word, and stopped. The
card explaining it was in a portal at the end of `<body>` with nothing tying
the two together. Keyboard users could open the card; they were never told
there was one.

The anchors now carry `aria-describedby` pointing at the open card's id
(`HoverCardTextAnchor`, and the id is wired through `HoverCardAnchor` /
`HoverCardSurface`). The attribute is set only while the card is up, since the
element it references does not exist otherwise.

`aria-describedby` rather than `role="tooltip"` on the card: several of these
cards hold interactive content — the attribution card's tree jump, links inside
option docs — and `tooltip` is specified as non-interactive, so claiming it
would promise a keyboard contract the widget does not implement. `aria-details`
is the richer fit and its AT support is still too thin to rely on.

The four hand-written copies of that span became one component while this was
being fixed, which is how three of them had come to be focusable-with-no-
description while the fourth, the one under test, was the same.

## Two findings no lint rule can see

Reading the app's roles rather than its lint output turned up two more, and
neither is reachable by any rule in the plugin — both are about a RELATIONSHIP
between two elements, and jsx-a11y checks elements one at a time.

**The preset tree announced no depth.** Its rows are windowed, so the tree is a
flat list of siblings in the DOM with no nested `role="group"` for AT to infer
hierarchy from. The only thing carrying the structure was `paddingLeft`, which
a screen reader cannot see. The APG's answer for exactly this shape is to state
the level, and `TreeRow` now sets `aria-level`. (`aria-required-attr` does not
catch this: `aria-level` is conditionally required, and the condition is
"is the hierarchy expressed structurally", which is not a property of the
element.)

**The new-pin card's tabs controlled nothing.** `AddTestBox`'s strip had
`role="tab"`, `aria-selected` and a correct roving tabindex, but no `id` on any
tab, no `aria-controls`, and no `role="tabpanel"` on the region they switch. It
announced "Paste JSON, tab, 2 of 3, selected" and then had nothing to say about
what that selection had done. `ResultsPanel`'s bar, the app's other tablist, is
textbook-complete — tab id, `aria-controls`, panel id, `aria-labelledby`,
`hidden` — so this was a half-built copy of a pattern the codebase already had
right.

One panel element rather than three: the card renders one tab's content at a
time, so a single region whose `aria-labelledby` follows the selection says the
true thing with one id instead of three. `TestsPanel.shimmed.test.tsx` guards
the pairing in both directions, and the guard was mutation-tested (dropping
`aria-controls` fails it).

## Why the offs went, and what replaced each

A global `"off"` is unbounded in three directions at once: every file, every
FUTURE file, and no record at the site that would explain the exception to
whoever meets it. That last one is what let the broken table sit undetected —
the reasoning lived in a config file nobody reads while looking at a component.

The 18 hits were three different shapes, so each now gets the narrowest
mechanism that fits it:

- **Fixed** where the rule was right (above).
- **Configured** where the rule ships the knob. All three
  `control-has-associated-label` hits were `<option value=…/>` inside a
  `<datalist>`, where the value IS the label and adding text content changes
  what the browser renders. `ignoreElements` exists for this; the list is the
  rule's own default plus `option` and `datalist`.
- **Disabled at the site**, with the invariant stated, for the 10 that are
  genuinely facts about one widget. This is the convention
  `react/no-array-index-key` and `no-non-null-assertion` already use here.
  `prefer-tag-over-role` takes no options at all, so it is the only bounded
  mechanism available to it.

The trade is deliberate: 10 one-line exceptions a reader meets in context, in
exchange for four rules that now fire on anything new. Four `"off"`s were
cheaper to write and bought nothing.

### The 10 that stayed

Worth recording, because "the rule is wrong here" is a claim that should be
checkable:

- **4 × `role="status"`** (the run announcement, the stale-results banner, the
  share receipt, the pin receipt). `<output>` is form-associated, and its
  IMPLICIT live region is materially less reliably announced than an explicit
  `role="status"` — for the share receipt it is also invalid, since `<output>`
  takes phrasing content and that card holds `<p>`s and a `<code>`. These
  elements exist to be announced; trading the reliable spelling for the tidy
  one loses the only thing they do.
- **`role="radio"`** (`SegmentedControl`). `<input type="radio">` is a replaced
  element rendering the platform's own dot-and-ring — the exact rendering a
  segmented control exists to replace.
- **`role="button"`** (`ProvenanceChip`). The chip renders inside the effective-
  config ledger's row-toggle button, and a button has no content model that
  admits another button. Corroborated in `KeyRow`, which documents the same
  arrangement for `OptionKey`.
- **`role="dialog"`** (`RuleEvidenceCard`). `<dialog>` shown modally moves to
  the top layer, discarding the viewport-coordinate placement this card is
  positioned by, and brings its own Escape protocol that would race the app's
  shared Escape ladder rather than join it.
- **`role="group"`** (`SequenceTimeline`). The rule offers `address, details,
fieldset, hgroup, optgroup`; every one means something this is not.
- **2 × tablist** (`ResultsPanel`, `AddTestBox`). The composite-widget pattern:
  roving tabindex on the tabs, container out of the tab order so Tab moves past
  the bar rather than into it. The container's keydown handler — the thing that
  makes the rule fire — is there because arrow-key navigation is delegated,
  which is the same pattern's other half. `interactive-supports-focus`'s
  `tabbable` option decides 0-vs-−1 and cannot express this.

## The mechanism that keeps this from rotting

Site-level exceptions are only better than blanket offs if they cannot outlive
their reason. `pnpm lint` now passes
`--report-unused-disable-directives-severity=error`, so a directive that has
stopped suppressing anything is itself an error: refactor the code out from
under a disable and the build says the comment is now a lie.

Switching it on immediately found three dead waivers that predate this work —
one directive on a line whose rule only fires on the next statement, and two
`eslint-disable` lines naming rules oxlint does not implement, which had
therefore never done anything at all. All three are gone.

A blanket `"off"` has no equivalent of this check, and that is the other half
of why the four went.

## Left open

`AddTestBox` and `ResultsPanel` are the app's only two tablists and both are
now complete. The remaining known gap is that the windowed preset tree states
`aria-level` but not `aria-setsize`/`aria-posinset`, so AT reports position
within the rendered window rather than within the tree. Fixing it means
threading the full sibling count through the windowing, which is a change to
`rows.ts`, not an attribute — deliberately not done here.

Also unchanged, and worth being explicit about: making the preset table view a
REAL grid (cells, column headers, roving grid navigation, `aria-rowcount` /
`aria-rowindex` to undo the windowing) would be better than the plain list of
buttons it now honestly is. Removing the false `role="table"` is not a
substitute for that; it is the correct state until someone builds it.
