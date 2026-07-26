# 040 — JSX-depth ratchet: decompose the three monoliths to maxDepth 4

Milestone: M10 · Status: done (2026-07-26)

## Summary

Measured 2026-07-26: above JSX nesting depth 4, every violation in the
app lives in exactly three files — `App.tsx` (71 sites, nesting to
depth 10), `RuleSimulator.tsx` (20), `PresetTree.tsx` (10). Every other
component already complies, so **depth ≤ 4 is the codebase's own
empirical norm** — the right lint threshold encodes the standard the
well-factored code already meets and flags only the debt. Going lower
would criminalize idiomatic markup (126 sites at depths 3–4 are
card-title > button > svg-shaped, spread across well-factored files).

`react/jsx-max-depth` counts element nesting within one JSX
expression; extraction resets the counter at component boundaries —
the rule is therefore a decomposition driver with a measurable exit
criterion, continuing 033 with an enforcement net 033 lacked.

## Scope

Ratchet, so CI enforces every step and each tightening commit stays
reviewable:

1. **Enable `react/jsx-max-depth: ["error", { "maxDepth": 6 }]`** —
   52 sites, only the three monoliths fail. Decompose to green:
   App.tsx's toolbar, welcome section, layers editor, token/share rows;
   RuleSimulator's form and verdict panels; PresetTree's detail panel
   sections (each extraction must preserve the 032 memo/latest-ref
   idioms — no new unstable props into memoized panels).
2. **Tighten to 5** (21 further sites at today's shape) — decompose to
   green.
3. **Tighten to 4** (28 further) — decompose to green. End state: the
   config permanently pins the house norm; a NEW component nested 5+
   deep fails CI instead of sailing through.

Each step lands as its own commit with the full suite green; the e2e
suite is the behavior-preservation net (033's rule: extractions are
behavior-preserving, proven by untouched tests).

## What was done

Three commits, one per ratchet step, each with the full suite green. The
counts below were re-measured on the post-039 tree (the numbers in the
Scope section above predate 039's `RepoLoadForm`/`.btn` work).

| step     | offending sites when the step began | files                                  |
| -------- | ----------------------------------- | -------------------------------------- |
| `max: 6` | 53 (App 44, PresetTree 5, Sim 4)    | App.tsx to depth **10**, Sim 8, Tree 8 |
| `max: 5` | 15 (App 7, Tree 4, Sim 2, Adv 2)    | all ≤ 6 by then                        |
| `max: 4` | 18 (Sim 11, Adv 5, App 2)           | all ≤ 5 by then                        |
| **end**  | **0**                               | config pins `["error", { "max": 4 }]`  |

(For reference, the same measurement on the pre-ratchet tree at depth 4 was
94 sites — App 64, RuleSimulator 20, PresetTree 10.)

**Note on the option name**: oxlint spells it `max`, not eslint-plugin-react's
`maxDepth`; a config using `maxDepth` fails to parse.

**Depth counting** (established empirically, since it decides where an
extraction has to sit): the outermost element of a component's JSX is depth
**0**, each nesting level adds one, a fragment counts as a level, and JSX
inside an attribute (`titleAction={<button/>}`) starts at its owner's depth
plus one. So `max: 4` means five levels of elements per component.

Components extracted (all behavior-preserving; DOM byte-identical):

- **Step 1** — `components/WelcomePanel.tsx` (the pre-run "How it works"
  steps), `components/ConfigEditorCard.tsx` (039's title action + repo-load
  chrome row, which are two elements deep inside a prop),
  `components/AdvancedZone.tsx` (the depth-10 corner: host/tokens + both
  layer editors); `VerdictKeyRow` + `SimFinal` in RuleSimulator;
  `PresetTableRow` in PresetTree.
- **Step 2** — `components/ConfigToolbar.tsx` (file name, revert, the GitHub
  auth chip, the standing untrusted-host reminder, Run, Copy link);
  `PlatformEndpointRow` in AdvancedZone; `SimMergedApplied` in RuleSimulator;
  `PresetListPane` in PresetTree (table header + the windowed row slice).
- **Step 3** — `components/NoticeBar.tsx`; `ResultsPane` in App.tsx (the
  `.results-col` wrapper + the 031 lazy boundary + the column, forwarding
  `ResultsColumnProps` unchanged); `HostAccessSection` and `LayerSection` in
  AdvancedZone (the global and inherited sections were identical down to the
  error text, so they now share one component); `SimClauseList`,
  `SimVerdictBlock` and `SimMessages` in RuleSimulator.

Placement follows 033/039: page-level sections became files under
`components/`, panel-internal pieces stayed local (non-exported) in the file
they came from, next to the `TreeRow`/`RuleRow`/`Field` they sit beside.

The 032 invariants hold: no extraction introduces a new prop identity below a
memoized panel (the memoized panels' props still come from App's `useCallback`
/ latest-ref idioms, unchanged), and `keystroke-render.test.tsx` keeps its
0-re-render assertion green at every step. Verification per step: `pnpm lint`
(0 errors; the warn-tier baseline stayed at exactly 141 = 130
`no-non-null-assertion` + 11 `no-array-index-key`), `pnpm typecheck`,
`pnpm format`/`format:check`, 178 unit tests, the app build, and all 49
Playwright e2e tests — every test file unmodified, which is what proves the
extractions behavior-preserving. As an extra net for the re-flowed copy, the
new `AdvancedZone`, `WelcomePanel` and `ConfigToolbar` were diffed against the
pre-040 JSX with `renderToStaticMarkup` across their branch combinations
(identical markup); that throwaway harness was deleted after it passed.

## Out of scope

- Depth below 4 — negative value on this codebase's idioms (recorded so
  the debate doesn't repeat).
- Any behavior or visual change; this is pure code shape.
- A component library (rejected — see 039).

## Dependencies

- 033 (the decomposition pattern and its hook extractions), 039 (its
  Button/RepoLoadPanel extractions shrink App.tsx's list first), 032
  (render invariants every extraction must preserve, guarded by
  `keystroke-render.test.tsx`).
