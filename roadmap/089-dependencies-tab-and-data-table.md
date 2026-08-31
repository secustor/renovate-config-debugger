# 089 — The Dependencies tab, and the data table it is built on

- Milestone: M21 · Status: done
- Design: Claude Design project "Renovate Config Debugger", artboards
  `Data Table.dc.html` (the component) and
  `Proposal F - Integrated Shell.dc.html` (the strip that now carries it)

## The ask

[087](087-ghost-row-and-repo-deps.md) taught the browser engine to extract a
loaded repository's dependencies, and then showed them in the one place they
were needed at the time: a **five-row picker** inside the Add-a-test card, two
disclosures deep, capped so the card would keep its height. A repository with
two hundred dependencies had two hundred rows behind a search box nobody was
looking at.

Two things follow, and this roadmap is both of them:

1. **The list deserves a tab.** "What does Renovate see in my repo" is a
   question about the repository, not a step in pinning a test.
2. **The app has no table.** Every list surface so far grew its own markup, and
   the design's `Data Table` artboard is the standard the next several were
   going to need anyway — a filter row, display options behind a gear,
   configurable grouping and columns, rows that open onto the full record.

## The component (`components/DataTable`)

Four files, and the split is the usual one: the decisions in a `.ts`, the
drawing in `.tsx`.

- **`data-table.ts`** — the shapes and the three pure decisions: what the
  filter keeps (`filterDataRows`, over the lead, EVERY cell — including the
  columns currently switched off — and the group titles), how rows fall into
  groups (`groupDataRows`, first-appearance order, distinct pills collected
  from the rows themselves), and which columns are on (`activeColumns` /
  `defaultVisibleColumns`, always in DECLARATION order, so the header row and
  the cells walk one list and cannot disagree).
- **`DataTable.tsx`** — the shell: toolbar, header row, groups, rows. It holds
  everything the reader can change (filter text, grouping, visible columns,
  which rows are open) because none of it is anybody else's business and none
  of it survives a reload. `useToggleSet` for both sets, so a no-op toggle
  costs no render.
- **`DataTableToolbar.tsx`** — the filter field, the optional context note
  ("from acme/webapp"), and the gear. The options are a POPOVER, through the
  app's one `useAnchoredPopover` contract, so Escape, the outside click and the
  focus hand-back behave as they do everywhere else.
- **`DataTableRow.tsx`** — a disclosure button carrying the lead, an optional
  amber badge and the active cells, with the action buttons as its SIBLINGS:
  nesting them would be invalid markup and would make every "Pin as test"
  click a row toggle too.

The table is **data-driven rather than generic over a row type**: a consumer
reduces its records to `DataTableRow` once (cells keyed by column id, a group
title and pill keyed by grouping id, the fields the open row lists), and the
component then needs no callbacks to render, group or search them. That is
what keeps it in `components/` while its first consumer is a feature — the
shared layer may not import a feature to find out what a row is.

Colors are the existing tokens throughout, and the primitives are reused
rather than restated: `.pill`/`.pill-muted` for the group header's manager
chips, `.btn-quiet` for the retry, `.caret` for the row triangle. What
`18-data-table.css` adds is only the table's own geometry.

## The tab

`deps` joins `RESULTS_TAB_IDS` between `effective` and `problems` — the
Integrated Shell artboard's order. No compatibility machinery: no link in the
wild says `deps`, and one that will was made by an app that has the tab. It
round-trips through the share codec untouched (asserted in `share.test.ts`),
because the codec validates `tab` against whatever the id list currently says.

- **Columns**: Current value (mono), Datasource and depType on by default;
  Manager and Package file off, because the default grouping is by package
  file and the manager rides on its header pills. Both are one gear-click
  away, which is the point of having the gear.
- **Groupings**: Package file (pills = the managers that read it — several
  managers legitimately claim one filename, and the pills are where that
  shows), Manager, None. Package file is the default: it is the order
  extraction already produced and the one a reader recognizes.
- **Rows** open onto the whole descriptor — every field `RepoDep.fill` carries,
  in reading order, empty ones dropped — labelled with Renovate's own field
  names, because the open row IS the descriptor a pinned test would carry.
- **Actions**: **Pin as test** and **Open in simulator**, both the SHELL's acts
  rather than the tab's. `onPinDep` completes the extracted descriptor with
  `EMPTY_FORM` and adds it to App's pin list; `onOpenDepInSimulator` mints a
  `SimRequest` — the same descriptor channel a share link uses, so the form is
  filled and re-simulated by the mechanism that already does exactly that —
  and both then `jumpToTab("tests")`, recording the one-step way back the way
  every other cross-tab link in the app does.
- **The badge count** appears only once discovery has REPORTED. A zero before
  that would claim the repository has no dependencies; the same rule the
  Overview and Effective badges follow for their async counts.

### Layering

The tab is a new feature slice (`features/dependencies/`), which is what the
codebase's structure asks for — the seventh beside editor, effective-config,
overview, pipeline, presets, session and simulator. It imports downward only:
`@/components/DataTable`, `@/types/repo`, `@/lib/format`. Nothing new had to
move into `types/`; 087's `RepoDep` already carries the descriptor.

Two consequences worth recording:

- **`RepoConnectPanel` moved to `components/`.** It is pure presentation over
  `RepoConnectOffer` and now has two consumers in two different slices, so the
  promotion rule applies (the alternative was a copy across the boundary). Its
  `pin-repo-connect` class names stay as they were — renaming them would touch
  a stylesheet for no behavioural reason.
- **Discovery is still on demand, and the trigger is still the shell's.** Every
  results panel stays MOUNTED (028), so a panel-side effect would fire for a
  tab nobody has looked at and spend the rate limit on it. App runs
  `ensureRepoDeps()` when `tab === "deps"`; `ensure` is idempotent per loaded
  repo, so the two doors onto the same discovery (this tab and the Tests tab's
  From-repository view) never discover twice.

### The nonce range

Three channels now mint into one `SimRequest` slot: the share hook (0, 1, 2 …),
`TestsPanel`'s own pin link (−1, −2 …) and this tab (from −1,000,000 down).
`useShareLinkRequest` applies a request once BY nonce, so two channels minting
the same number would let one swallow the other's request. A dependency row's
request also records the share nonce it was minted under and stops being the
current request the moment a NEW link arrives — so a link can never be masked
by a row somebody clicked ten minutes ago.

## Deltas from the artboard

- **No view switcher and no quick-filter section.** Both are in the artboard's
  gear popover; neither has a consumer yet. The Dependencies tab has one
  rendering and its filter is the toolbar's field, so shipping either would be
  a control with nothing behind it.
- **No "… N more" elision.** The artboard caps a group and counts the rest.
  This tab renders every row on purpose: it IS the full searchable list, and
  the cap belongs to the Tests tab's picker, which is a card that has to keep
  its height (087 wrote down why). The elision is a component feature the day a
  consumer needs one.
- **Row actions are not repeated inside the open row.** The artboard draws them
  in both places; one set is enough, because they never leave the screen when
  the row opens.
- **The `custom.regex` badge renders, but nothing produces one yet.** 063's
  custom managers are unimplemented, so no extracted row can carry a
  `custom.`-prefixed manager id today. The badge is one string test and the
  shape being ready, which is cheaper than retrofitting it.

## The strip had to make room

The seventh tab — wearing the longest label in the strip — wrapped the results
tablist onto two rows at 1280px, which `12-layout-regressions` guards against
and 083 had already fought once. Measured in a real Chromium against the
production build, across `system-ui` and three deliberately wider fallbacks
(Verdana is the worst case at ~4% over macOS's SF), the row was ~12px short.

What paid for it, as this shipped: the tab type down to 0.8rem, the sides to
0.3rem, and — the part that actually bought the room — the count badge
flattened to a plain number beside its label rather than a second chip.

**Reversed, and this is what is in the tree**: the bubble IS the design's count
grammar (the Final artboard draws every tab count as a pill), so it stays. The
row's budget comes instead from a compact cut of the pill — 0.66rem type,
0.3rem sides, which a strip-height count can afford where a body chip cannot —
plus the artboard's own 0.78rem tab type and 0.28rem sides. One row verified at
1280px under `system-ui` and Verdana.

## Verification

- `components/data-table.test.ts` — the filter (lead, hidden-column cells,
  group titles, case), the grouping (order, distinct pills, the null/"None"
  case, a row with no answer for the active grouping), the column defaults and
  their declaration order.
- `components/DataTable.test.tsx` — the rendered contract: default grouping and
  columns, regroup and ungroup from the gear, a column toggling header and
  cells together, the filter and its "nothing matches" line, a row opening onto
  its record, an action firing WITHOUT toggling the row, the badge's title.
- `features/dependencies/dep-rows.test.ts` — the mapping: a cell per declared
  column, the two groupings, the whole descriptor (not just the name) handed to
  each action, the field order and the empty-field rule, and the badge firing
  for `custom.` and nothing else.
- `features/dependencies/DependenciesPanel.test.tsx` — the four states, each of
  which must NOT be an empty table: not loaded (the connect offer), loading,
  failed (with its retry), nothing found — plus the loaded case's totals and
  provenance line.
- `lib/share.test.ts` — the strip is the current seven in order, and a link
  naming `deps` round-trips it.
- e2e: `11-tabbed-shell` (the seven tabs, in order, with the new panel mounted
  and hidden on arrival) and `12-layout-regressions` (the one-row strip, now
  seven).

## Addendum — the deltas that closed, and three defects

Recorded here rather than rewritten above, because the reasoning that shipped
this tab was sound at the time; what changed is that the artboard's remaining
capabilities acquired a consumer (the Effective-config tab's migration) and the
tab was read on a real screen.

- **The view switcher and the quick-filter section exist.** Both are the shared
  component's, optional and consumer-agnostic: `views` + `altView` (the first
  view is the table; any other replaces its body, and the filters go inert
  while it is up) and `quickFilterLabel` (its own Filter section, composed with
  the text filter as AND). With them, an optional toolbar copy button, a
  `detail` node the open row draws above its fields, and toned group pills plus
  `plainTitle` for a grouping whose headers are prose rather than paths. The
  tones are the app's existing `.pill-*` classes; no new colors.
- **The header row now mirrors the rows' geometry.** It faked the caret with a
  left padding of its own, which never accounted for the flex gap, so every
  column label sat off its cells. The metrics are one `--dt-*` block in
  `18-data-table.css` read by both the header and the rows, and the header
  opens with an empty slot exactly `.caret`'s width.
- **The gear looks like a button.** A bare `⚙` on the toolbar's ground read as
  decoration. It now wears the outline button's border, radius and hover at the
  icon-only padding — the same grammar as the CopyButton beside it.
- **The three pre-report states are a shared component.** 090 grew a second
  surface over the same discovery, so the connect offer / "reading…" / failure
  triple became `components/RepoDiscoveryGate` — the promotion rule again, the
  same one that moved `RepoConnectPanel` down here. What "nothing was found"
  MEANS stays each consumer's: no dependencies is not the fact no matched files
  is.
- **The row actions moved into the OPEN row**, under the fields, which reverses
  the "one set is enough, drawn on every row" delta above. Two hundred rows
  each wearing two buttons is a wall of chrome, and a row that ends in buttons
  is a row whose cells stop short of the header's columns — the same defect as
  the header's, from the other end. They are still siblings of the disclosure
  button, never its children.
