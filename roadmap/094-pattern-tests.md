# 094 — Pattern tests: does this `match*` pattern match what I think it matches?

- Milestone: M21 · Status: done
- Design: Claude Design project "Renovate Config Debugger", artboards
  `Pattern Tests.dc.html` (the component), `Pattern Tester Options.dc.html`
  (the variations it was settled from) and `Proposal F - Integrated Shell.dc.html`
  (the Tests tab it sits in, under the pins).

## The ask

Every `matchPackageNames`, `matchFileNames`, `matchRegistryUrls` entry is a
glob — or a regex when written `/…/` — and the two traps are well known: a
`**quay.io/**` that never matches `https://quay.io` (minimatch's `**` glued to
text is a single-segment wildcard, and a trailing `/**` demands a path), and a
`!react-dom` whose reader forgets that a negative entry must ALSO hold. Until
now the only way to find out was to write the rule, run, and read the
simulator's clause grid.

The design's answer is a second test group on the Tests tab, next to the
pins: a **pattern test** is one `match*` list option, the patterns the reader
is writing for it, and the inputs those patterns should (and should not)
match. Each input wears the mark Renovate's own matcher gives it and the
expectation the reader holds; the card's sentence is `N of M expected`; the dot
is red the moment an assertion fails. Like a pin, a pattern test is standing:
it rides in the share link and is re-evaluated whenever anything changes.

## What was built

### Engine: `pattern-match.ts`

`explainPatternMatch(patterns, input)` — `matches` IS upstream's
`matchRegexOrGlobList`; the per-entry breakdown asks the same predicate
(`matchRegexOrGlob`) one entry at a time, so the explanation cannot disagree
with the verdict (`pattern-match.test.ts` proves it case by case). Each entry
says how upstream reads it (`any` / `regex` / `glob`, negative, case
sensitivity, an invalid regex that upstream's validator would reject) and
whether its body hit; a miss carries a `reason` (`no-positive`, `blocked`,
`empty`).

A missed positive glob is tried against two rewrites — `/**` → `{/,}**`, and a
leading `**` → `**/` — and only a rewrite upstream's matcher ACCEPTS for that
input is ever suggested. The design's `{/,}**` hint on its own was a mockup
approximation: for `**quay.io/**` against `https://quay.io` the rewrite that
works under minimatch is `**/quay.io{/,}**`, and the suggestion says that.

`patternListOptionNames()` reads the option table (`patternMatch`, array-typed,
`parents: ["packageRules"]`, no enum) rather than hand-listing the eleven
matchers, so an upstream addition shows up on a version bump; the test pins
the list for the pinned Renovate.

### App

- **`types/simulator.ts`** — `PatternTest` / `PatternInput`, beside `PinnedTest`
  for the same layering reason.
- **`features/simulator/pattern-tests.ts`** — the pure half: the share
  round trip, `evaluatePatternTest` (the sentences, the counts, the row's why,
  given an injected matcher), and `seedValuesFor` — where "+ add the N values
  from your last run" looks per option: the pins' descriptors and the loaded
  repository's extraction.
- **`PatternTests.tsx`, `PatternTestCard.tsx`, `PatternTestBody.tsx`,
  `PatternTestRows.tsx`, `PatternAddLine.tsx`** — the strip, the accordion of
  cards, the two-column body, the in-place editable rows, the dashed add lines.
  The option is a native `<select>` rather than the design's searchable
  popover: eleven names, and the browser's own picker is the more accessible
  control at that size. The head row's toggle is ONE control (caret + dot) with
  a pointer-only mirror over the rest of the row, so assistive tech sees a
  single expand/collapse.
- **`app/use-pattern-tests.ts`** — the shell's list, in `usePinnedRun`'s shape;
  the Tests badge counts both groups; `ShareState`/`SharePayload` carry
  `patternTests`, sanitized per entry and bounded on every axis
  (`MAX_PATTERN_TESTS`, `MAX_PATTERNS_PER_TEST`, `MAX_PATTERN_INPUTS`,
  `MAX_PATTERN_LENGTH`), additive within v2 exactly like `pins`.
- The share note under the tab now says "Both test groups are saved with the
  share link" and moved from the Add-a-test card's footnote to the view's last
  line, under both groups.

### Deliberately not built

- **The editor popover** (`Pattern Popover.dc.html`, Proposal F's inline
  "Test this pattern" on a config line) is a separate artboard and was not in
  this scope. The empty state's copy was adjusted accordingly — it does not
  promise "pin one from the editor".
- **A CLI subcommand.** `rcd` could answer the same question headlessly
  (`explainPatternMatch` is on the engine barrel); nothing in the design asked
  for it.

## Tests

- engine `src/pattern-match.test.ts` (golden): verdict parity with upstream,
  the reasons, the verified suggestion, the option list.
- app `pattern-tests.test.ts` (unit, stub matcher), `PatternTests.test.tsx`
  (components, stub engine), `PatternTests.shimmed.test.tsx` (Renovate's own
  matcher through the card), `share.test.ts` (round trip, tolerance, caps),
  e2e `23-pattern-tests.spec.ts` (a link carries them, the badge counts both
  groups, an edit re-evaluates without a Run).
