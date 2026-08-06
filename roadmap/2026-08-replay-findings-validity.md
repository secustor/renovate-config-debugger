# Findings-Validity Report — Persona Study Replay (Renovate Config Visualizer)

11 findings verified against the codebase: **10 confirmed, 1 invalid**. Ordered confirmed-first, by impact severity.

## 1. Summary table

| ID  | Finding (short)                                                                                                                   | Validity    | Impact                                                                                    | Effort |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------- | ------ |
| R3  | Unset simulator fields fail-close as a "no match" indistinguishable from a real mismatch (field-agnostic; hit via sourceUrl here) | confirmed   | Corrupts conclusions for any config matching on non-primary fields; misled all 3 personas | M      |
| R1  | Simulate-button layout shift + stale results card reads as fresh                                                                  | confirmed   | Lost work mid-flow; stale screenshots cited as evidence                                   | M      |
| N2  | Drawer cross-links scroll before drawer body mounts — visual no-op                                                                | confirmed   | First-click failure on the primary evidence link                                          | S      |
| N6  | Clause values truncated with no full-value access; checks column collapses to 1ch                                                 | confirmed   | Evidence uncitable; failing rows unreadable                                               | S      |
| S1  | Scenario 44772 ground truth stale after renovate 44.x bump                                                                        | confirmed   | Every future persona-test run on this scenario is corrupted                               | M      |
| N8  | A/B delta shows inherited default as explicit run-A value                                                                         | confirmed   | Wrong authorship conclusions in the most citable output                                   | M      |
| N4  | Verdict sentence ungrammatical + false claim about automerge scoping                                                              | confirmed   | Flagship quotable sentence broken; (b) spreads misinformation                             | S      |
| N3  | "0 effective options" flashes in digest/badge during provenance load                                                              | confirmed   | First-impression contradiction; self-healing                                              | S      |
| R4  | no-input vs no-match collapsed at badge level                                                                                     | confirmed   | Screenshots ambiguous for expert citation; prose is correct one click away                | S      |
| R6  | 0-based `packageRules[713]` beside 1-based "714 rules" reads as off-by-one                                                        | confirmed   | Trust cost; numbering itself is correct                                                   | S      |
| N1  | "Apply fix" clickable-but-inert from Simulator tab                                                                                | **invalid** | None — tooling artifact of the study, not an app defect                                   | S      |

## 2. Per-finding detail

### R3 — silent fail-closed "no match" when a simulator field is unset (confirmed)

**What**
A field-agnostic presentation defect. The simulator's primary grid (`SimulatorForm.tsx`: datasource/packageName/currentValue/newValue) is deliberately curated to the most-used fields — it cannot hold every matcher input, and any other field (`sourceUrl`, `categories`, `repository`, `depType`, …) lives in the collapsed `MoreFieldsDrawer` and defaults to unset. When a matcher then fail-closes on such an unset field, the engine already emits a distinct "no-input" clause state with an explanatory note (`packages/engine/src/simulate-package-rules.ts:424-436`), but the collapsed RuleRow header (`ruleLabel()` in `rule-format.ts:132-143`) renders "matchSourceUrls — failed on matchSourceUrls" with a plain "no match" badge — identical wording to a genuine mismatch — and `verdict-sentence.ts` has no caveat path. The personas' "silently manufactures a no match" is accurate for every layer visible before expanding a rule row, and would be equally true for any other drawer field; scenario 44772 merely happened to hit it via `sourceUrl`. (Context, not the defect: roadmap 047 moved sourceUrl from the primary grid into the drawer, which is why this scenario's key field starts unset — but no static primary-grid composition can prevent this class, so the fix must be at the labeling/verdict layer.)

**Impact**
Corrupts user conclusions for any config whose deciding rules match on fields outside the primary grid: all 3 personas on 44772 were misled and the expert nearly published a wrong diagnosis. The user gets a confident-looking "no match" that is an artifact of the empty form — exactly the class of false verdict the simulator exists to prevent — and the trap re-arms for every field the primary grid doesn't (and can't) carry.

**Why it was missed so far**
The engine's no-input state is tested as data (`simulate-package-rules.shimmed.test.ts`), but no app test asserts the distinction is _visible_ at collapsed-row or verdict level — the defect is a missing presentation layer, so there was no UI to test. The Stop hook excludes e2e; lint/typecheck cannot see prominence/wording defects. No persona study exercised a drawer-field-deciding scenario against the current layout until this run.

**How it will be fixed**
Field-agnostic changes from data already in the browser: (1) `ruleLabel()` — when the deciding clause is "no-input", change the suffix to "— failed on \<matcher\> (\<field\> not set in this simulation)", for whatever field the matcher reads. (2) Verdict-level caveat when a no-match is decided solely by no-input clauses: "N rule(s) failed only because a field was left unset in this simulation (\<fields\>) — this result may not reflect a real Renovate run." These two fixes close the whole class regardless of which field is involved. (3) Optional, config-driven discoverability: since the primary grid stays curated to the most-used fields, surface a hint (or dynamically render the field) when the _loaded config's_ rules match on a drawer field — driven by the config, not hard-coded per field. Deliberately skip prefilling from Renovate's bundled monorepo data — that would simulate away exactly the bug class 44772 represents. Tests: unit tests for the no-input label branch and verdict caveat, using at least two different fields to pin the field-agnostic behavior.

### R1 — Layout shift + stale-results card (confirmed)

**What**
(1) Layout shift: `RuleSimulator.tsx` renders `HypotheticalBanner` (line 346), the focus hint, and the `MoreFieldsDrawer` above `.sim-actions` with no height reservation, so the Simulate button moves when the validation banner toggles; `use-simulation-run.ts` (lines 87-97) also nulls `sim` on every new pipeline run, collapsing the results block. (2) Stale card: the feat(015) veil (`.sim-results-body.stale`, `index.css:3243`: grayscale 65% + opacity 0.5) is relative dimming only — a dimmed card in a cropped screenshot is structurally identical to a fresh result, with no watermark and no statement of which inputs produced it. The `stale` flag itself is computed correctly.

**Impact**
Highest-frequency friction of the run (6/9 sessions). The shift eats clicks mid-flow — one session silently discarded an in-progress simulation (lost work). A screenshot of a stale result taken as evidence is actively wrong, corrupting the user's conclusion. Hits the core edit→simulate loop.

**Why it was missed so far**
Zero coverage of the stale state (no e2e mentions "stale"; no unit/render test hits that branch). `12-layout-regressions.spec.ts` asserts static layout, never button-position stability across banner mount/unmount — CLS-class defects are invisible to functional Playwright assertions. The Stop hook excludes e2e. The veil shipped after the 2026-07 baseline; this was its first persona exposure.

**How it will be fixed**
(a) Keep `HypotheticalBanner` mounted and toggle `visibility: hidden` when configInvalid is false; stabilize `.sim-actions`; verify the drawer opens below the button. (b) Make stale self-evident on the card: `position: relative` plus an `::after` overlay stamp (content: "Stale — inputs changed, simulate again"), opacity ~0.35, and extend the banner text to name the run's inputs ("These results are for `{packageName} {currentValue} → {newValue}` — inputs changed since this run.") so any screenshot is self-labelling. E2e: stale-class + overlay assertion in `04-simulator.spec.ts`; boundingBox-y stability assertion in `12-layout-regressions.spec.ts`.

### N2 — Drawer jump scrolls against stale closed-drawer layout (confirmed)

**What**
In `packages/app/src/features/simulator/use-simulator-drawers.ts`, `jumpToStep()`/`jumpToRules()` call `scrollIntoView()` synchronously in the same tick as `setMergeOpen(true)`, but `SummaryDrawer.tsx:54` mounts the drawer body only when open — so the scroll is clamped to the closed-drawer document height. From the bottom of the verdict card (where the "see the flatten step →" and thread step links live) there is ~0 px of slack: the scroll is a visual no-op and the drawer opens off-screen. Reproduced against the production build (`window.scrollY` 248 → 248; doc height grew 948 → 1681 after the fact). The code comment asserting "the same call works on a closed drawer" states the wrong invariant.

**Impact**
Every cross-link that opens a closed drawer dead-ends exactly when the reader is where those links live. The flatten pre/post view is the app's headline answer to update-type suppression questions — the top recommendation of the 2026-07 study — so the expert's core evidence path reads as broken. First-click navigation failure; quick sessions conclude the feature is a stub.

**Why it was missed so far**
Covering e2e tests (`04-simulator.spec.ts:221-259, 267-301`; `17-verdict-threads.spec.ts:190-226`) assert only `toHaveJSProperty("open", true)` and stepper text — never `toBeInViewport()` or scroll movement; Playwright locator assertions are position-blind. The Stop hook excludes e2e. The thread-jump wiring (054 layer 4, commit c2b2b35) shipped after the baseline study.

**How it will be fixed**
Defer the scroll until the drawer body commits, using the same pending-target idiom as `focusKey` in `use-thread-nav.ts`: `const [pendingScroll, setPendingScroll] = useState<"rules" | "merge" | null>(null);` plus a `useEffect` that scrolls the matching ref and clears the state; `jumpToRules()`/`jumpToStep()` just set the pending value. Fix the now-false comment. Regression e2e: scroll to bottom with drawer closed, click the flatten link, assert `.sim-merge-steps .migration-step-head` `toBeInViewport()`.

### N6 — Truncated clause values + collapsed checks column (confirmed)

**What**
(a) `previewValue(value, 60)` in `rule-format.ts` slices clause JSON before it reaches the DOM; `ClauseGridRow` renders it with no title/expand/copy — the full value never exists in the page (`fullValue()` exists but is module-private). (b) `.sim-clause-grid` in `index.css` (~line 2500) uses `--kv-cols: max-content max-content minmax(0, 1fr) auto`; the `auto` evaluated column grows toward its max-content before the fr track gets space, so long fail explanations starve the checks column (min size 0 via `minmax(0,1fr)` + `overflow-wrap: anywhere`) down to ~1ch — one glyph per line. Subgrid on `.kv-row` means one failing clause collapses the column for the entire grid. Matched rows render fine, matching the persona's asymmetry.

**Impact**
(a) makes the clause value uncitable and uncopyable — for long matchSourceUrls arrays the complete list is the artifact the user wants. (b) breaks legibility of precisely the failing rows a user opens to learn why a rule did not match. The tool fails its "show me the evidence" job in the failure path.

**Why it was missed so far**
ClauseGrid shipped 2026-08-03 (PRs #88/#95/#96), after the persona baseline. jsdom does no layout, so collapsed tracks are invisible to unit/render tests; e2e specs assert text content only; `12-layout-regressions.spec.ts` measures geometry only for the repo panel and editor. Stop hook excludes e2e; lint cannot see CSS track-sizing interactions.

**How it will be fixed**
(b) Change the track list to `--kv-cols: max-content max-content minmax(0, 1fr) minmax(0, 1.6fr);` so the evaluated track can no longer starve checks. (a) Export `fullValue` from `rule-format.ts`; minimum viable is `title={fullValue(clause.value)}` on the `.sim-clause-value` span, real fix is a click-to-expand with the full string selectable. Guard: extend e2e 06 with a no-match fixture asserting `.sim-clause-checks` boundingBox width > ~80px and that the full value is retrievable from the DOM.

### S1 — Scenario 44772 ground truth rotted under the Renovate pin (confirmed)

**What**
`.claude/skills/persona-test/scenarios/44772-monorepo-preset.md` hard-codes "monorepo:react matches only matchSourceUrls: [https://github.com/facebook/react], so the clause never fires" — true for renovate 43.275.0 when written (commit ec87a08), false since PR #78 bumped the pin to 44.x, whose `dist/data/monorepo.js:584` is `["https://github.com/facebook/react", "https://github.com/react/react"]`. The preset now matches; both the ground truth and the symptom framing are false premises, and the rubric would grade a persona's _correct_ observation as wrong. No mechanism links scenario ground truth to the pinned version.

**Impact**
Every future /persona-test run including 44772 is corrupted: three browser sessions chase a fixed bug, the orchestrator grades accurate reports as wrong, and the baseline comparison for study finding P1 becomes meaningless. No end user is affected — but it invalidates one of only three benchmark scenarios.

**Why it was missed so far**
The scenario library lives under `.claude/skills/`, outside every automated regime — not a workspace package, so the Stop hook, oxlint, vitest, and Playwright never touch it. PR #78's full CI verifies shim fidelity and schema drift, not scenario preconditions. Ground truth is prose graded post-run, so staleness only surfaces in a live run — which is how it surfaced, 11 days after the bump.

**How it will be fixed**
Options (b)+(c) combined; (a) — rewriting the ground truth — is rejected because it also falsifies the symptom framing, leaving a scenario that tests nothing. (1) Replace the scenario with a real, still-reproducing discussion verified against renovate 44.4.6 (the worktree name `replace-44772-scenario` indicates this is already underway). (2) Add a machine-checkable "## Validity precondition" section to the scenario template — a fenced js block asserting against the pinned renovate dist — plus a `--verify <scenario.md>` mode in `generate-links.mjs` (which already resolves the pinned renovate) that exits non-zero on failure; SKILL.md step 3 runs `--verify` before generating links and aborts stale scenarios loudly instead of spawning personas.

### N8 — A/B delta presents inherited default as explicit value (confirmed)

**What**
`compareSimulations()` in `packages/engine/src/simulate-compare.ts` diffs raw `finalDependencyConfig`s with no provenance, so an inherited Renovate default (e.g. `automerge: false` from `getDefaultConfig()` via `pipeline.ts`) is emitted as `{key: "automerge", before: false, inA: true, after: true}` and rendered by `ConfigDeltaSection`/`WriteRow` as "~ automerge false → true". Meanwhile `RuleSimulator.tsx`'s `changedKeys` memo (lines 193-206) hides the same default from A's field list — the inconsistency the expert observed. The value is behaviorally correct; its provenance is dropped exactly where it matters.

**Impact**
Hits any comparison where a delta key's A-side value is an inherited default — a common shape. An expert citing the delta asserts an explicit `automerge: false` the config never contains; less-expert users hunt for a line that isn't there. Misleading provenance in the tool's most citable output.

**Why it was missed so far**
`simulate-compare.node.test.ts:94` actively pins the current behavior — the suite treats default-inherited and explicit values as the same by construction. Diff and display filter live in different packages with separate suites; no test asserts consistency between them. The only pin/compare e2e covers the input-mismatch warning, never configDelta rows. Compare merged one day after the baseline study.

**How it will be fixed**
Engine: compute `beforeInherited = inA && !a.mergeSteps.some(s => s.merged.some(m => m.key === key))` (and symmetrically for after), added as optional booleans on `ConfigKeyDelta`. App: when `d.beforeInherited`, render the before cell as `false (default — not set in A)` — the expert's wished "(unset → default false) → true" shape; `WriteRow` gains a small optional note. Tests: new inherited-case in `simulate-compare.node.test.ts`, update the line-94 expectation, extend `WriteRow.test.tsx`.

### N4 — Verdict sentence: broken grammar + false automerge claim (confirmed)

**What**
In `buildVerdictSegments` (`packages/app/src/features/simulator/verdict-sentence.ts`): (a) line 130 pushes the bare noun "auto-approval" into a positives list of verb phrases joined under one shared "would", producing "would automerge, get labels […], and auto-approval". (b) Line 117 emits `automerge (automerge is scoped to ${types}…)`, phrasing a fact about this config's flattened blocks as an inherent property of the automerge option — specced verbatim in roadmap 022, so a design defect.

**Impact**
This is the simulator's headline verdict, built to be quotable and the app's most-screenshotted output. (a) makes the flagship sentence read as broken English; (b) actively misinforms — pasted into a PR, it teaches a false general rule about Renovate's automerge option and propagates beyond the user.

**Why it was missed so far**
`verdict-sentence.ts` has no unit test at all; e2e asserts structure (verdict visible, counts), never the assembled prose. Lint cannot see grammar. Shipped in feat 012 and refined by 022, both after the baseline study.

**How it will be fixed**
(1) Change `positives.push("auto-approval")` to `positives.push("get auto-approval")`. (2) Replace the line-117 string with: `automerge (your config enables automerge only for ${scopedAutomerge.join("/")} updates${source ? ` — from \`${source}\`` : ""})`. (3) Update the stale doc-comment example (lines 69-71). (4) Add `verdict-sentence.test.ts` locking the joined text for the broken ordering, scoped-automerge with/without source preset, and the defaults sentence.

### N3 — "0 effective options" first-paint flash (confirmed)

**What**
`EffectiveConfig.tsx`'s stats effect (lines 771-773) calls `onStats` unconditionally, including while provenance is still `undefined`, reporting `{keys: 0}`. App's `setEffectiveStats(null)` reset fires earlier (App.tsx:461), but the lazily mounted component's interim 0 overwrites it, so the badge shows "0" and the digest says "merged into 0 effective options" — the deliberately built pending path ("The effective options are still being counted…", `run-digest.ts:259-263`) is dead on first paint. Self-corrects when provenance resolves.

**Impact**
Every user landing on the Overview sees "✓ Renovate accepted this config … merged into 0 effective options" for the provenance window (noticeable on large preset expansions, and what demos/screenshots capture). Contradicts the digest's own no-disagreement guarantee; a green verdict beside "0 effective options" reads as "nothing resolved". Trust/cosmetic, self-healing.

**Why it was missed so far**
The pending path is unit-tested only in the pure module; no render test mounts EffectiveConfig with an onStats spy. The one relevant e2e reads the badge after visibility, by which time provenance has resolved — no assertion forbids an interim 0. E2e excluded from the Stop hook; digest/badge shipped after the baseline study build.

**How it will be fixed**
Guard the effect: `if (provenance === undefined) { return; } onStats?.({ keys: tallies.shown, overridden: tallies.overridden });` with `provenance` added to the dep array — the badge stays absent and the digest keeps its pending clause until real numbers land. Add a render-project test asserting onStats stays silent pre-provenance and first fires with keys > 0; optionally tighten e2e 11 to allow only the pending sentence or a non-zero count.

### R4 — no-input collapsed into "no match" at badge level (confirmed)

**What**
The engine records six clause states, but `rule-format.ts` collapses twice: (1) `RuleRow.tsx:66` / `RuleEvidenceCard.tsx:78` render `VERDICT_LABEL[rule.verdict]` (only matched/no-match/not-simulated), so data-mismatch and fail-closed missing-input rules show identical "no match" badges; (2) `clauseIcon()` maps no-input, not-applicable, and not-simulated all to "⚠" with one shared warn color (`index.css:2232-2234`). Only the expand-to-read prose disambiguates. (The expert's "no drill-down" side-claim is only discoverability — expandable ClauseGrids exist.)

**Impact**
A screenshot of a collapsed row cannot show whether the rule mismatched real data or was never given the input — hurts the paste-evidence-into-a-discussion workflow. Moderate: the verdict is oracle-faithful and the explanation is one click away. Baseline Finding 9, partially fixed, badge-level residue.

**Why it was missed so far**
The data layer is explicitly tested (`simulate-package-rules.shimmed.test.ts:211-251`), but no app test asserts distinct states render distinguishably; no no-input/not-applicable fixtures exist in the render tests. The collapse is intentional code (documented in clauseIcon's comment), so Stop-hook checks can never flag it — a presentation-design gap.

**How it will be fixed**
(1) `clauseIcon()`: return "∅" for not-applicable/not-simulated, keep "⚠" for no-input only; split the CSS selector group so the former use `var(--muted)`. (2) Add `ruleVerdictLabel(rule)` returning "no match — input not set" when the deciding clause is no-input; use in both badge sites. (3) Unit test asserting `clauseIcon("no-match") !== clauseIcon("no-input") !== clauseIcon("not-applicable")` and label divergence for the two fixtures.

### R6 — 0-based indices beside 1-based counts (confirmed)

**What**
`packageRules[{rule.index}]` is 0-based by deliberate roadmap-013 design (matches Renovate's own validator messages verbatim; comment at `RuleRow.tsx:61-63`), while the adjacent framing header (`rule-framing.tsx`) is a 1-based cardinal. Both are individually correct, but no UI copy anywhere says indices are 0-based, so "714 rules … 713 pulled in by config:recommended" beside "packageRules[713]" reads as an off-by-one. The defect is the absent disambiguation, not the numbering.

**Impact**
Cosmetic-to-moderate: no cross-reference is corrupted, but newcomers suspect a counting bug in the tool. Switching to 1-based would be worse — it would break byte-level agreement with Renovate's real output.

**Why it was missed so far**
Tests assert the exact 0-based strings — they encode the spec, so they can only confirm intended rendering, never that two correct numbers read as contradictory when juxtaposed. Both 013 and 016 shipped after the baseline study; this juxtaposition was never persona-exercised.

**How it will be fixed**
Keep 0-based. (1) `RuleRow.tsx:64`: `title="0-based index — the same numbering Renovate's own validator messages use; the last of N rules is packageRules[N−1]"` on the index span; (2) same title in `RuleEvidenceCard.tsx:76` and `:271`; (3) one visible anchor: in `rule-framing.tsx` `variant: "full"`, append ` (indexed packageRules[0]–packageRules[${nf.format(total - 1)}], as Renovate cites them)` when total > 1. Unit assertion for the suffix; extend e2e 04 to pin the heading.

### N1 — Hidden "Apply fix" reachable from Simulator tab (INVALID)

**What**
No defect. The tab shell keeps panels mounted and hides inactive ones with the HTML `hidden` attribute (`display: none` — no CSS overrides it). A `display: none` element has no accessibility-tree node, is unfocusable, and has zero geometry, so no real user can encounter or click it. The persona's automation read the raw DOM (it reported the button's `title` attribute as its accessible name) and its coordinate click on a zero-size element dispatched nowhere — producing the observed "silent no-op". Had the handler fired, `applyErrorFix` (App.tsx:702-729) would have changed the editor regardless of tab.

**Impact**
None on users. Mounted-but-hidden is the standard WAI-ARIA tabs pattern and preserves per-tab state (roadmap 028). The cost is to study methodology only: DOM-snapshot element discovery reports controls inside `hidden` subtrees as interactable.

**Why it was missed so far**
Nothing was missed — the behavior is correct and already covered: `e2e/11-tabbed-shell.spec.ts` (lines 33-37, 161-163) asserts inactive panels are mounted yet `toBeHidden()`. The gap is in the study tooling, which surfaced raw DOM nodes instead of the computed accessibility tree.

**How it will be fixed**
Do not act on the app. Fix the study protocol: require element discovery via the computed accessibility tree or visibility-filtered queries in the persona-test skill, treating controls inside `[hidden]` ancestors as non-existent; optionally note in `roadmap/2026-07-persona-ux-study.md` that this observation was a tooling artifact.

## 3. Cross-cutting observations

**Pattern 1 — Position-blind assertions.** Four confirmed findings (N2, N6, R1, and partially N3) are geometry/timing defects invisible to the existing suites: Playwright locator assertions check existence, text, and `open` properties but never `toBeInViewport()`, boundingBox stability, or scroll movement; jsdom performs no layout at all, so collapsed grid tracks and CLS shifts cannot fail any unit/render test.

**Pattern 2 — Post-baseline shipping without persona re-exposure.** Nine of ten confirmed findings are in code that shipped _after_ the 2026-07-23 baseline study (feat 012/013/015/016, roadmaps 022/029/046/047/054, the compare feature, ClauseGrid). The study is the only regime that catches perceptual/prose/prominence defects, and every one of these features had its first persona exposure only in this replay.

**Pattern 3 — Tests that pin the defect.** In two cases the suite actively encodes the wrong behavior as expected: `simulate-compare.node.test.ts:94` pins the provenance-free delta (N8), and the index tests pin the exact 0-based strings without any juxtaposition check (R6). Green tests were evidence _for_ the defect, not against it. Also: e2e is entirely excluded from the Stop hook, so even the specs that exist don't run on change, and the persona scenario library sits outside every automated regime (S1).

**Three concrete suggestions:**

1. **Add a geometry tier to e2e conventions**: any spec asserting a navigation/open action must also assert `toBeInViewport()` or a boundingBox delta; extend `12-layout-regressions.spec.ts` beyond the repo panel/editor to the simulator (clause grid width, `.sim-actions` position stability). This closes the entire Pattern-1 class.
2. **Gate Renovate bump PRs on scenario preconditions**: the S1 `--verify` mode in `generate-links.mjs` should also run in CI on any PR that touches the engine's renovate pin, so ground-truth rot fails the bump PR instead of a study three weeks later.
3. **Schedule a persona-test replay after every user-facing feature batch** (or before tagging a release), since it is demonstrably the only regime catching prose, prominence, and juxtaposition defects — and fix the study tooling to use the accessibility tree (per N1) so its findings stay high-precision.

## 4. Suggested fix order

1. **N2** (S, highest impact-per-effort): single-hook fix in `use-simulator-drawers.ts` unblocks the app's headline evidence path.
2. **Batch: R3 + R4 + N4 + R6** — all four touch the same simulator formatting layer (`rule-format.ts` in R3/R4/N6, `RuleRow.tsx` + `RuleEvidenceCard.tsx` in R3/R4/R6, `verdict-sentence.ts` in R3/N4). One PR lands the no-input labeling, verdict caveat, grammar/scoping fix, and index disambiguation coherently, with one shared unit-test file expansion.
3. **Batch: N6 + R1** — both touch `packages/app/src/index.css` (clause-grid tracks; stale veil/overlay) plus `RuleSimulator.tsx` (R1); land together with the new geometry e2e assertions so the specs are written once.
4. **N3** (S, isolated): one-guard fix in `EffectiveConfig.tsx` + render test; independent of everything else.
5. **S1** (M): replace the 44772 scenario and add the `--verify` precondition mechanism — do this _before_ the next persona replay or Renovate bump, or the benchmark stays corrupted.
6. **N8** (M, last): spans engine + app with a pinned test to rewrite; valuable but lowest urgency since behavior conclusions remain correct.
7. **N1**: no app work — fold the accessibility-tree requirement into the persona-test skill alongside the S1 changes (same skill directory, natural batch).
