# 084 — The post-v2 cleanup pass

Milestone: M20 · Status: done (feat/v2)

## What this is

Not a feature. 075–083 built the v2 shell one tab at a time, each against its
own artboard, and each landing under a deadline that made "leave the second
spelling in place" the cheap choice. This is the pass that collects the debt:
three adversarial reviews run in parallel — one hunting dead code, one hunting
duplication, one checking the tree against what the roadmap docs actually claim
about it — then ten commits (`e4d3259` through `bdac367`), then a fourth review
confirming the ten and a fix round closing what it found.

The rule the pass worked to: a finding gets fixed only if the fix is
behavior-preserving or the behavior it changes is a bug. Everything else is
ledgered here instead, which is most of the "deliberately not done" section
below.

## What moved, and why

- **Shared primitives** (`699c251`) — `Caret`, `useToggleSet`, `ShowAllMore`,
  `SegmentedControl`. Each existed three to five times, spelled slightly
  differently at each site, because each tab built its own while the tab next
  door was still being written. One home apiece; the call sites keep their own
  copy, which is what made the divergence invisible until they sat side by side.
- **`lib/provenance-layer.ts`, `lib/description-approx.ts`** (`dc1b9b3`) — out
  of `components/`. They are DOM-free and on the headless (CLI) path, which is
  what earned them the move — not a property of `lib/` itself [corrected
  2026-08-23: see the addendum]; 034 had put `provenance-layer`
  under `components/` only because that is where it was extracted FROM.
- **`features/overview/description-digest.ts`, `description-topics.ts`**
  (`dc1b9b3`) — the other direction. One consumer, absent from the headless
  barrel: 049's rule sends a single-consumer derivation into the slice that
  consumes it.
- **`EffectiveConfig.tsx`, 1179 → 287** (`545f660`) and **`AdvancedZone.tsx`,
  813 → 178** (`6ce6f55`) — split into their component clusters. Both were over
  048/049's norm for a view module by a factor the depth ratchet had already
  been complaining about locally.
- **`App.tsx`, 1919 → 1840** (`74a3b66`, `c9c3b56`, `bdac367`) — three state
  clusters out into `use-pinned-run`, `use-results-tab`, `use-panel-stats`. 033
  had taken App down once already; these three are the regression, and they are
  hooks rather than components because the state outlives any one panel.

## The headless purity guard

`lib/headless.ts` is the seam `packages/cli` compiles, and 058 stated its
promise — everything below it is pure, no React, no DOM — in the barrel's own
header comment and nowhere else. `dc1b9b3` turned that comment into
`lib/headless.test.ts`: walk the transitive closure with `fs` + `path` (every
specifier in it is a static relative or `@/` path, so no bundler is needed) and
assert both halves — the closure lives under `lib/`/`data/`, and no file in it
names a browser global or imports React.

The confirming review then found the walker itself under-reporting. Its
specifier regex used `[^;\n]*?`, which cannot cross a newline, so a multi-line
`import {…} from "x"` never matched: the walk saw 13 files where the closure is
18, and the chain the guard most exists for — `rule-filters` →
`provenance-layer` → `glossary-data` — was outside it. Fixed to `[^;]`, and the
floor changed from `size > 10` to membership of those three files: a count floor
is precisely what let an under-walk pass as a pass.

## Behavior deltas shipped knowingly

A cleanup pass is supposed to change nothing. These changed something, on
purpose:

- **The one-off dot is honest** (`e4d3259`) — it reported a verdict without
  consulting caveats or errors, so a run that could not be trusted still got a
  confident dot. It now honors both, and renders the caveat that explains
  itself. This is a bug fix, not a cleanup.
- **Paste-a-descriptor accepts every field the form has** (`e4d3259`) — it had
  been written against the string fields only, so the multi-value keys silently
  became "ignored keys". Arrays now fill by joining, and the ignored-count note
  says "the form can't hold" rather than "not a string", which stopped being
  true the moment arrays became holdable.
- **"1 more defaults" → "1 more default"** — the shared `ShowAllMore` pluralizes
  where one of the four originals did not.
- **The caret glyph is one size** — the four call sites had drifted to
  0.68rem / 0.7rem / 0.8rem and unified at 0.75rem. Recorded here because
  `699c251`'s body calls the primitive extraction behavior-preserving, which is
  true of everything in it except this: three of the four carets are visibly a
  different size than they were.
- **The PresetTree segmented control gained radio-group semantics** — the shared
  `SegmentedControl` is `role="radiogroup"` with an accessible name and
  `aria-checked` per option; the tree's own hand-rolled version was buttons. An
  accessibility fix that arrived with the primitive.
- **`descriptionLedgerNonce` is deliberately NOT reset with the panel stats**
  (`bdac367`) — it looks like the other panel-reported values and it is not: it
  is a request counter, and bumping or clearing it fires a landing nobody asked
  for. `use-panel-stats` leaves it in App.

## Deliberately not done

- **~60 unused exported types stay exported.** They are the documented return
  and argument shapes of hooks and view-models — the export is what makes a hook
  contract readable at its own definition, and deleting them would trade
  documentation for a smaller symbol table.
- **Fifteen-odd classNames with no CSS rule behind them stay.** [superseded
  2026-08-24: they were told apart and removed — see the addendum] They are
  container and wrapper classes across the simulator (`sim-groups`,
  `sim-write-row`, `sim-json-line`, `sim-field-multi`, `sim-ut-value`,
  `sim-final-config`, the `pin-section`/`pin-rule`/`pin-bucket` shells), the
  Overview (`overview-card`, `overview-count`), the preset views
  (`preset-desc-body`, `preset-desc-hover`, `preset-ref-body`) and a few
  one-offs (`app-brand-title`, `landing-examples-label`, `repo-toggle`,
  `platform-from-global`, `option-card-desc`). Some are hooks the design will
  want; some are dead. Telling those apart is a design question, not a lint
  finding, and it is not this pass's to answer.
- **The Overview's `TailToggle` is not folded into `ShowAllMore`.** It is
  two-way (show all ↔ show less) where `ShowAllMore` is one-way, and the
  design's copy for it names the group it reveals. Unifying them means picking
  one of the two behaviors; ledgered instead.
- **`TreeRow`'s caret button is not migrated to `Caret`.** `Caret` is a glyph;
  the tree's is a real focusable control with its own keyboard contract.
- **The `MergeStop` interface stays in `merge-stops.tsx`.** Two pure model
  modules import it type-only from a module that also builds JSX — a model
  shape in a view file. Nothing leaks at runtime, so carving out a
  `merge-stops-model.ts` waits until the file is next touched for real work.
- **`openGroup` stays positional.** Converting it to an options object touches
  every caller for readability alone.
- **`PinSectionHead`'s tone in the one-off sections is unchanged.** The review
  read the neutral tone as a miss; it is a factual count, and a count has no
  verdict to tone.
- **Knip / an unused-export CI gate is not added.** The reviewer suggested it;
  given that ~60 of the current unused exports are deliberate, the gate would
  start life with an allowlist as long as its findings. Left to the user to
  decide whether that trade is worth making.

## Tests

No new suite beyond `lib/headless.test.ts`. The existing unit and render
projects are the pass's proof: every extraction and every move had to leave 869
app unit tests and the CLI's 324 green, which is what "behavior-preserving"
means operationally here. (The `render` project was split into `components` and
`shimmed` by the second cleanup pass; the sentence is what it was at the time.)

## Addendum — 2026-08-23: two claims the second cleanup pass corrected

**`lib/` is not "the DOM-free layer", and no rule here says it is.** The
sentence above reads that way, and it would be a rule this repository does not
keep: eight `lib/` modules touch the DOM by design — `anchored-card`,
`escape-stack`, `focus-landing`, `focus-restore`, `motion`, `results-tab-dom`,
`share` and `shortcuts` — and belong there, being shared browser machinery with
no feature to live in. The invariant that IS tested is narrower and is the one
this pass built: everything in the transitive closure of `lib/headless.ts` is
pure (no React, no browser global) and lives under `lib/`/`data/`, asserted by
`lib/headless.test.ts`. So "DOM-free and on the headless path" is what earned
`provenance-layer.ts` and `description-approx.ts` their move — a property of
those two modules, not a promise about their destination. The general rule for
`lib/` is still 049's: shared by consumers in more than one place.

**The knip ruling was taken, and it is yes.** The "deliberately not done"
bullet above left an unused-export gate to the user on the grounds that it
would start life with an allowlist as long as its findings. The second cleanup
pass measured the premise and found it false once the engine barrel was
trimmed: `pnpm check:exports` now gates CI, scoped to exports only, with the
two carve-outs and the reasoning in `knip.jsonc`'s own header.

## Addendum — 2026-08-24: the inert classNames went, and both directions are pinned

**"Telling those apart is a design question" was half true, and the half that
was not is now a test.** Each token on that list was checked for a CSS rule, an
e2e locator, a test selector and a `querySelector`; the ones with none of the
four were removed (`e01d366`), and the six that style nothing but ARE test
selectors — `overview-card`, `overview-count`, `preset-desc-body`, `dropped`,
`sim-ut-value`, `sim-write-row` — kept, each with a one-line comment saying so.
`rules` and the table row's bare `src` stayed too: their twin badge is live, and
one badge idiom keeps one spelling.

What was a design question was only ever "should this become a hook?"; "is
anything using it?" is a filesystem question, and `src/class-coverage.test.ts`
now answers it on every run, in both directions. A className app source writes
must be styled by `index.css`/`styles/*.css`, selected by a test, or
allowlisted with a reason; a class selector those stylesheets declare must be
written by app source, selected by a test, or allowlisted (two entries at head,
both classes a third-party library writes and the app only themes). It is a
test rather than a lint rule because the invariant spans a `.tsx` file and a
`.css` file — neither oxlint nor stylelint can hold both halves — and because
tests gate exactly like lint here, through the Stop hook and CI.
