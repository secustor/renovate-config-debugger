# 092 — The Effective tab, on the shared data table

Milestone: M21 · Status: done · Design: Claude Design project "Renovate Config
Debugger", artboard `Effective Tab Final.dc.html` · Reverses parts of
[082](082-final-tab-specs-deltas.md)'s toolbar and bands rulings.

## The ask

The owner's directive, in one line: **"EffectiveToolbar should be part of the
DataTable of EffectiveConfig."**

[089](089-dependencies-tab-and-data-table.md) built the app's standard data
table and gave it one consumer. What the artboard asks the Effective tab for —
a filter box, a copy button, display options behind a gear, a grouping whose
headers carry a pill and a count, columns the reader can turn on, rows that
open onto the full record, and a second rendering of the same records — is that
component's list, item for item. The tab had a hand-rolled version of every one
of them, built before the component existed.

So the whole tab is now ONE `DataTable` plus a footer line. Nothing about what
the tab KNOWS changed: every derivation that fed the bands still feeds the
table.

## What moved where

| Was                                                                                                         | Is                                                                                                 |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `EffectiveToolbar.tsx` — filter, `only overridden`, the By key / As JSON segmented control, the copy button | the table's toolbar (filter + copy) and its gear (View, Filter, Group by, Columns)                 |
| `Bands.tsx` — one `<details>` per deciding layer, its headline sentence, its row cap and "show all"         | the table's `decided-by` grouping: a prose title, one toned pill, the count the table itself makes |
| `KeyRow.tsx` — the row's three cells and its expansion                                                      | `effective-rows.tsx` (the mapping) + `KeyRowParts.tsx` (the note cell, the detail block)           |
| `DefaultRow` — an inert row with no caret                                                                   | an ordinary row of the defaults group, with no `detail` and one field (the value in full)          |

- **`effective-rows.tsx`** is the whole of the new code: the columns, the
  grouping, the views, and `effectiveTableRows(groups, context)` mapping the
  provenance entries `groupByDecider` produced into `DataTableRow`s. It is the
  Dependencies tab's `dep-rows.ts` in the same position, one file up in
  richness because three of this tab's cells are more than strings.
- **`KeyRowParts.tsx`** holds the two React pieces those rows hand over — the
  note cell (glossary card, warn tone) and the open row's detail (blame ledger +
  cascade + deferred per-rule table). A module of its own only because a file
  that exports components may export nothing else
  (`react/only-export-components`).
- **`decider-groups.ts`** keeps every derivation and swaps one: `deciderHeadline`
  (a three-emphasis band sentence) becomes `deciderHead` (a prose title and one
  pill). The table states the count itself, so a header that also spelled it
  would say the same number twice in one line.
- **`EffectiveConfig.tsx`** now owns exactly the three pieces of state the table
  cannot: `query`, `onlyOverridden` and `view` are handed down as controlled
  values, because a run resets all three and the description digest's link sets
  two of them. `openKeys` is the fourth, one step weaker (see below).
- **Deleted:** `EffectiveToolbar.tsx`, `Bands.tsx`, `KeyRow.tsx`, and the CSS
  that only they wore — `.prov-toolbar*`, `.prov-filter-input`, `.prov-list`,
  `.prov-section*`, `.prov-headline-*`, `.prov-band-*`, `.prov-row*`,
  `.prov-key-*`, `.prov-detail`. `.prov-filters`/`.prov-check` stay: the
  As-JSON view's options row still wears them, and it is now the tab's one
  remaining chrome row of its own.

### The design, as it lands

- **Lead column "Option"** — the key, mono, still carrying its docs hover card.
- **Columns** — Value (mono, 16rem) and Note (13rem) on; **Decided by** (7rem)
  off, because the grouping already heads every row with its deciding layer.
  It is there for the reader who ungroups, and for the one who wants the
  SPECIFIC preset rather than the group's name.
- **Grouping "Decided by"**, the default and the only one — `Your repo config`
  / the top-level extend's name / `Renovate defaults`, each a plain (non-mono)
  title with one pill in the layer's own existing tone.
- **Views** — By key (the table) and As JSON (`ResolvedJsonView`, unchanged,
  as the table's `altView`). Picked in the gear now, not in a segmented control
  in the toolbar. The filters go inert while the document is up, saying why.
- **Quick filter** — `only overridden`, the gear's Filter section, composed
  with the text filter as AND.
- **Copy** — the resolved document, the table's `copy` slot, `null` until the
  payload exists so the slot draws nothing rather than a button that would fail.
- **Footer** — `N effective options · hover any key for Renovate's docs ·
defaults have no cascade — only the default ever touched them`, in the By-key
  view only: the As-JSON document has trailing notes of its own.

## What the shared component had to gain

Four optional additions, all consumer-agnostic, all absent from the
Dependencies tab, which is behaviourally unchanged. Three of them follow ONE
rule — **the string stays the table's, the node only changes what is painted**
— so a decorated cell can never hide a row from the search box:

- **`DataTableRow.leadNode`** — what the lead cell draws when the row's subject
  is more than its text. Here, the option key with its docs card. `lead` is
  still the string the filter matches.
- **`DataTableRow.cellNodes`** — the same for a cell. Two of this tab's three
  use it: `packageRules`' value cell is 016's rule framing ("3 rules — 2 from
  your config…"), and the note cell carries the warn tone and the glossary card
  the one-word badge used to hold. `cells[id]` is still what the filter searches
  and what the cell quotes in its `title`.
- **`DataTableColumn.width`** — a flex basis read by BOTH the header cell and
  the data cells, so they cannot disagree. The table's `--dt-cell` default was
  right for a table whose columns are all the same kind; a Value column and a
  seven-rem "Decided by" are not.
- **`DataTable.openKeys`** — NOT a controlled value: an assignment applied when
  the set's identity changes, after which the reader's carets win again. Two
  events need it and nothing else does: a new run closes everything, and the
  description digest's "show raw order" link opens one particular row. It is
  the same during-render `useSyncedReset` idiom the feature already used for
  its own expansion set, moved behind the component's edge.

Nothing else about the component moved, and no new colors: the group pills are
the app's existing `.pill-*` tones, and the only new geometry is one
`.data-table-row-detail:last-child` bottom padding in `18-data-table.css` (the
detail is the bottom of the open row when a consumer supplies no fields — the
mirror of the rule `.data-table-fields` already had from the other end).

## What this reverses in 082

082 read the `Effective Tab Final` artboard as a set of bespoke surfaces,
because in August the app had no table to read it as. Four of its rulings are
withdrawn here — recorded rather than rewritten, the way 087 recorded the ghost
row and 091 recorded 075's non-goal:

- **GAP-1/GAP-2's "ONE toolbar row"** stands as a GOAL and falls as an
  IMPLEMENTATION. There is still one control strip in both views; it is the
  table's, and the four controls are distributed the way the `Data Table`
  artboard distributes them — the filter and the copy in the row, the view and
  the quick filter in the gear. `.prov-filters.prov-toolbar` is gone.
- **GAP-4/GAP-5/GAP-6's defaults band** — always present, folded shut, INERT
  rows. Still always present, no longer folded (the table has no collapsible
  groups) and no longer inert: a defaults row is an ordinary disclosure whose
  open state carries the value in full rather than a cascade. The honest
  sentence 082 put in the band's footer is now the TABLE's footer, which is
  where it belongs: it is true of every defaults row, and the artboard writes it
  once under the whole table.
- **GAP-7's eight-row cap per band** is withdrawn outright. 089 already argued
  the case for its own tab and it holds here: this table IS the searchable list
  of every option in the run, the filter is one field away, and the cap that
  protected a card's height protects nothing in a grouped table. `shownAllBands`
  and this tab's `COLLAPSE_AFTER` use go with it (the blame ledger and the
  preset ledger keep theirs — those are cards).
- **GAP-3's band headline** (`config:recommended decided 24 options`) becomes
  the group's plain title plus the table's own count. The reader still reads
  the extend's name; the sentence around it was the band's, and the band is
  gone.

082's other Effective-tab rulings are untouched and still tested: the
winner-first cascade, the deferred per-rule table, the same-value warn note,
the prose third cell with no layer chip beside it, the two controls the design
never had (the layer `<select>`, the `show default-only` checkbox), and the
description row's ledger.

## Verification

- `features/effective-config/EffectiveConfig.shimmed.test.tsx` — rewritten onto
  the table's locators, twelve cases: the stats contract, the description
  ledger (including the duplicate and the non-string member), the winner-first
  cascade and the deferred rule table, the digest link's landing (query, quick
  filter cleared, row OPEN through `openKeys`), the three groups in order with
  their pills and counts, a narrowed group counting what it shows, the quick
  filter dropping the defaults first, the copy in both views, the filters inert
  over the document, and the same-value note.
- `components/DataTable.test.tsx` — the four additions: the lead and cell nodes
  drawn while the strings stay searchable and quoted, a column's width in the
  header and in every cell, and `openKeys` honoured on the FIRST render, handed
  back to the reader's caret, then re-assigned by a new set.
- `features/effective-config/decider-groups.test.ts` — `deciderHead` in place of
  `deciderHeadline`: the prose titles, the tones, the extend's name, and the
  fact that only the presets group takes a name from the run.
- `src/class-coverage.test.ts` is what proves the CSS retirement is exact in
  both directions — no rule left for a class nobody writes, no class written
  that nothing styles.
- e2e updated, not run here: `15-resolved-config` drives the view from the gear
  and asserts the table's filter input; `11-tabbed-shell` and `09-schema-option`
  move to `.data-table-filter` / `.data-table-row`; `helpers.ts`'s
  `effectivePresetChip` finds the preset group by its `presets` pill; and
  `19-keyboard`'s bare-key test opens the gear to reach the one checkbox this
  tab still has.
