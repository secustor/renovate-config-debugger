# 079 — The simulator form as a sentence

Milestone: M20 · Status: done (feat/v2)

## Summary

The design project's `Simulator Form Redesign.dc.html` (with the handoff notes
in `Handoff - Add a Test.dc.html`) replaces the presentation of the simulator's
inputs outright. What 047 shipped was a labelled 4-field grid, a derived
`updateType` one-liner underneath it, and one "More about this update" drawer
holding the other fourteen fields. What the design asks for reads instead of
asks:

> **Start from:** `npm dependency` `Dockerfile image` `GitHub Action` …
>
> A **patch** update of `lodash` from `4.17.20` to `4.17.21` from the `npm`
> registry.
>
> ▸ Where it lives in your repo · 3 set
> ▸ Where it comes from · none set
> ▸ Versioning details · none set

Nothing about the form's BEHAVIOUR moved. 015's derivation and empty-form
guard, 068's Enter rules, 021's select-on-focus, the share-link encoding and
`toDescriptor` are all exactly where they were — this is a presentation pass,
and the tests that pin those rules are the ones that say so.

The form has two homes and one implementation (075 iteration 6's rule: the
Tests tab's Add-a-test panel embeds the simulator's own form, never a
simplified copy that would drift from it). The design's `compact` prop is now a
real prop: compact is one column with no descriptor preview (`AddTestBox`),
standalone is two columns with it (`RuleSimulator`).

## What changed

- **The four identifying fields became a sentence.** `SentenceLine.tsx` — a
  bordered card holding "A ⟨updateType⟩ update of ⟨packageName⟩ from
  ⟨currentValue⟩ to ⟨newValue⟩ from the ⟨datasource⟩ registry.", the blanks
  borderless mono inputs on a dashed accent underline. They have no visible
  label, so each carries its Renovate name as `aria-label` — which is also how
  every test and every `getByLabel` addresses them. `datasource` keeps its
  047 `<datalist>` combobox, and its title now names the REAL registry size
  (`datasourceNames.length`) instead of the design's baked-in 81.
- **`updateType` is a chip inside the sentence.** `UpdateTypeChip.tsx` — the
  design's amber "derived" styling (warn text on the warn tint, 1.5px dashed
  warn border, ▾), with the nine-type override behind a real `<select>` that is
  stretched over the chip and painted out (`opacity: 0`). A click anywhere on
  the chip is the platform's own picker: no new a11y machinery, no roving
  focus, no menu of our own. 047's `UpdateTypeLine`/`UpdateTypeSelect` are
  deleted; their sentence survives verbatim as the chip's `title`, including
  every honest state — "derived from 4.17.20 → 4.17.21 — click to override",
  "no update type could be derived from …", "fill the version pair to derive
  it".
- **One drawer became three named groups.** `FieldGroup.tsx` (the shell) +
  `FieldGroups.tsx` (the three, and the field list each holds). Header = caret,
  title, and a count pill — accent-tinted "N set", ghost "none set" — so a
  wrong quick-fill is catchable while everything is closed, which is what
  047's computed summary line existed for. One group open at a time; the index
  is the caller's (`AddTestBox`'s own state, `useSimulatorDrawers`'
  `openFieldGroup` in the simulator), so a re-simulation or a new pipeline
  result never folds what the reader opened.
- **`registryUrls`, `lockFiles` and `categories` are chips.**
  `MultiValueInput.tsx` — a box that looks like an input, one pill per
  committed value with an × to remove it, and a borderless draft input that
  Enter turns into the next pill. `FormState` still holds one comma-separated
  string per field: the chips are a VIEW over it (`splitValues`/`joinValues` in
  `form.ts`), because the share-link codec encodes the form as flat strings and
  `toDescriptor` is what splits these three on commas. Enter here is the third
  claimant on that key after 068's two, and it is handled in the field, not on
  the form: bare Enter commits and `preventDefault`s (so implicit submission
  cannot fire), ⌘/Ctrl+⏎ is left alone for the app's Run chord.
- **The standalone simulator gained the live descriptor.**
  `DescriptorPreview.tsx` — the design's sticky "DESCRIPTOR RENOVATE WILL MATCH
  AGAINST" card, printing what `toDescriptor` would SEND (so the derived
  `updateType` appears as the value that will be matched on, not as the empty
  `form.updateType` behind it).
- **The quick-fill chips say which example this is.** `QuickFillChips.tsx`,
  with the active chip derived from the form (`activeQuickFill`) rather than
  remembered from the click — see the ledger.
- **Both action rows print the key.** The Add-a-test panel's Simulate already
  said `Simulate ⏎`; the standalone simulator's now does too. One grammar for
  "Enter does this", on both of the form's homes.

`SimulatorForm`'s props changed with it: `moreFieldsOpen`/`onMoreFieldsToggle`
→ `openGroup`/`onOpenGroupChange` (`-1` = all closed), plus `compact`;
`updateTypeTouched` is gone from the props because the chip derives "is this a
derivation?" from `effectiveUpdateType === derivedUpdateType` — the hook still
owns the flag, and `setUpdateTypeTouched` is still what the override sets.

## Deliberate differences kept (the design should adopt these, not the app)

- **Glossary `<Term>` labels, not `title` tooltips.** The design's group fields
  wear a dotted underline with a `title`. The app's `<Term>` renders the same
  dotted-underline-with-hover grammar but opens the glossary card — plain
  language, a Renovate docs link, and keyboard-reachable, which a `title` is
  not. Every group label is a `<Term>`, as it was in 047's drawer.
- **The active quick-fill chip is derived, not remembered.** The design keeps
  `state.fill` from the click. Here a chip is lit exactly while every value it
  writes is still in the form (`activeQuickFill`). Two ways a remembered chip
  could lie are what this avoids: a chip left lit after a pin cleared the form,
  and a chip left lit after the empty state's own quick-start chips
  (`EmptyTestsCard`, which seeds through `AddTestBox`'s `seed`/`seedNonce`)
  wrote a DIFFERENT example through a channel the form never sees. The cost is
  that editing one of the fill's own values drops the highlight, which is the
  honest reading of "start from".
- **Unset keys are omitted from the descriptor preview.** The design's preview
  is always shown against a quick-filled form, so it never has to answer this.
  An absent field and a field set to `""` are different questions to Renovate's
  matchers, and `""` is not a descriptor this form can produce — so the preview
  prints only what `toDescriptor` would actually send. A form with nothing in
  it prints `{}` and says "Nothing identifying yet — fill in the sentence
  above, or start from an example." rather than seven empty strings.
- **`FormState` keeps the multi-value fields as comma-separated strings.** The
  chips are a view. Making them arrays would mean a second representation to
  keep in step with the share-link codec and `toDescriptor` for no gain, and a
  value containing a comma stays inexpressible either way — exactly the limit
  the comma-separated text field already had.
- **Chip values are deduplicated.** A repeated registry URL or category means
  nothing to any matcher that reads them, so the chip view does not show one
  twice — which is also what makes each chip's own value its React key.
- **JSON tones come from the palette, not the mock.** The design's `#0055aa`
  keys / `#aa1111` strings cannot ship: stylelint bans raw color literals, and
  red is this app's error hue, which a perfectly healthy value must not wear.
  Two new `:root` aliases instead — `--json-key` onto the accent the app
  already uses for config keys, `--json-string` onto the teal that is not
  spoken for in running text — both theme-aware through what they point at.
- **Focus rings are not suppressed.** The mock's blanks carry `outline: none`.
  These are the form's primary fields; the ring stays, and the painted-out
  `updateType` select gets one on its wrapper (`.sim-ut-chip:focus-within`)
  since its own is invisible by construction.
- **The two-column layout is `auto-fit`, not `1fr 1fr`.** The simulator lives
  in the results COLUMN, whose width the viewport does not report — so the
  preview drops underneath the groups on its own below ~18rem of column rather
  than at a viewport breakpoint that would be measuring the wrong thing.
- **No "Pin as a standing test" in the standalone simulator.** The design's
  actions row has one, and the Add-a-test panel's does. In the app a pin is
  made in the Tests tab, which owns the pins list; the standalone simulator's
  "Pin" already means something else (the A/B comparison pin on the verdict
  card, 044). Two different pins in one view is the confusion this declines.
  (Superseded by 080 — retiring the A/B pin freed the name.)
- **The one-off result card is unchanged.** Already at parity (077), and the
  design's copy of it in this artboard is the same card.
- **The disabled repo tab says "soon", not "sign in required".** The handoff's
  hint and title assume 078's repo extraction exists and is merely gated on a
  sign-in; it does not exist yet, so signing in would enable nothing — the
  app's wording ("soon"; "Load a repository's config to pick from detected
  dependencies — not available yet") is the honest version until 078 ships,
  at which point the handoff's copy becomes the right one.

## Tests

- `SimulatorForm.test.tsx` (render project) keeps 068's Enter contract — the
  Run chord from both comboboxes, bare Enter declined in a combobox and only
  there — and adds the redesign's own shape: the sentence's four blanks and the
  derived chip's title, three groups with only the open one mounted, the
  preview present standalone and absent compact, and a multi-value field's
  Enter committing rather than submitting.
- `form.test.ts` (new, unit) covers `activeQuickFill`'s four states and the
  `splitValues`/`joinValues` round trip through `toDescriptor`.
- `TestsPanel.test.tsx` needed no change: it drives the form by
  `getByLabelText("packageName")`, which the sentence blanks answer to.
- e2e `04-simulator.spec.ts`'s form test was rewritten against the new DOM
  (sentence blanks, the chip's title, group counts, one-group-at-a-time, the
  live descriptor); `19-keyboard.spec.ts` addresses `packageName`/`datasource`
  by label instead of by `.sim-field`. Not run in this pass — the suite needs a
  production build.
