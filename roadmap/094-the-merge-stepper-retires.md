# 094 — The merge stepper retires; the stops stay

Milestone: M21 · Status: done · Reverses one line of
[080](080-tests-succeed-the-simulator.md) ("`mergeStepIndex` / `view.simStep`
share plumbing is untouched", 080:83).

## The ruling

The merge replay's CONTENT is the answer; walking it one index at a time was
never the question. [044](044-simulator-merge-step-through.md) gave the
simulator the migrate stage's step-through (Step N of M, Prev/Next, a per-stop
`JsonDiff`, a cumulative toggle) and
[046](046-simulator-verdict-card-and-merge-timeline.md) put a clickable chip
timeline on top of it, sharing one index. Both are gone. What each stop SAYS —
base, every matching rule with its identity, provenance and the keys it wrote,
update-type flattening, the final per-dependency config with its Copy — is now
a static ordered list, every stop on screen at once.

The test of the ruling, applied below: **a stop is a section, not a selection.**
Anything that existed only to move the selection goes; anything that named a
stop keeps naming it.

## The evidence

The retirement was carried 3-0 in the refactor sweep's retention review. The
stepper is the one simulator surface with the repo's own evidence against it,
and that trail is on file in three places:

- **No persona origin.** 044 is an owner-motivated item ("today they
  reconstruct it in their head"), and 046 came out of a design review, not a
  study session. Every other simulator layer traces to a persona finding.
- **The CLI already measured it.** `packages/cli/src/projections/simulate.ts`
  (roadmap 068's H1, 6 of 9 persona sessions): on a `config:recommended` run
  `mergeSteps` is 797 kB of a 1.36 MB answer, "how did the merge proceed — a
  question nobody asked", and it drowned the one that was. Personas at every
  level asked by hand for the matched rules, `flattened` and
  `finalDependencyConfig`. That is why `--detail full` is opt-in there, and it
  is the same judgement here.
- **The stops themselves are load-bearing.** The 2026-08 replay-validity doc
  names the flatten stop as the app's headline answer to update-type
  suppression, and the README promises the resolved per-dependency config with
  a Copy. Those are kept, verbatim.

## What changes

- **The stepper goes.** Deleted: `SequenceTimeline.tsx` (its last consumer —
  075 had already moved the Pipeline tab to `StageRail`) and, with it, the
  `.stage-timeline` / `.stage-sep` / `.stage-chip*` CSS block. `SimMergeBody`
  no longer renders `StepThrough`; it renders `<ol class="sim-merge-stops">`,
  one `<li>` per stop, each carrying the counter, the head and the explanation
  the stepper used to show one at a time.
- **`MergeStop` is prose plus an identity.** The `chip` / `step` halves become
  flat `id` / `counter` / `head` / `explanation` / `body?` / `count?` — no
  before/after snapshots, since nothing diffs them any more. The derivations
  that read stops (`verdict-threads.ts`, `rule-evidence.ts`) only ever read
  `kind` / `ruleIndex` / `merged` and are untouched; `count` stays because the
  collapsed drawer summary quotes the flatten stop's `⊘7`.
- **The index plumbing goes.** `mergeStepIndex` / `onMergeStepChange` are out of
  `use-run-view-selection.ts`, `run-view-context.ts`, `ResultsColumn.tsx`,
  `TestsPanel.tsx`, `RuleSimulator.tsx` and `use-simulation-run.ts` (with its
  `keepStep` argument, which existed only so a link's restored index survived
  its own auto-run). No state replaces it: `use-simulator-drawers.ts` keeps
  `jumpToStep(stopIndex)`, which now opens the drawer and scrolls to that
  stop's anchor (`mergeStopId`, `dom-ids.ts`) through the same deferred
  pending-scroll the 2026-08 findings-validity fix installed. `jumpToReplay`
  moves into the hook beside it, landing on the drawer's head.
- **`StepThrough` loses the four fields 046 added for the merge timeline** —
  `counter`, `body`, `cumulativeLabel` and `benignRemovals` — and with them
  `JsonDiff`'s parameterized `BenignRemovals` API, whose only caller was the
  flatten stop's diff. The component itself stays: `MigrationSteps` is the
  migrate stage's adapter over it and is behaviourally unchanged. The `$schema`
  benign note (026) is untouched and still writes `.diff-benign-note`.
- **Decode compat: `simStep` is decoded and ignored**, the `tab: "simulator"`
  precedent (080). `share.ts` keeps the field, `input-schemas-zod.ts` keeps
  sanitizing it, and nothing reads it — a link that carries one loads, restores
  its `sim` descriptor and its `simThread`, and simply does not open the replay
  drawer. Nothing encodes a new one.

## What deliberately does not change

- Every stop's own content: the base stop's framing sentence, each rule stop's
  `packageRules[N]` identity + provenance chip + "This rule set …", the flatten
  stop (both branches: merged up, or consumed without applying), and the final
  stop's config with Copy.
- The verdict card's threads and its two full-trace links. A thread's
  "step 2 of 2 in the replay →" still points at that stop and still lands on it.
  A rule stop's counter repeats the link's own wording (`Step N of M`); the
  flatten stop's link ("flatten step") lands on a stop counted "After the rules"
  and headed "Update-type flattening" — legible by its head, not by a matching
  counter.
- The migrate stepper (004), its share `view.step`, and the compact preset-row
  instance.
- `rcd simulate` / `compare_simulations`: untouched, and the headless successor
  below.

## The honest loss

**Cumulative per-stop document diffing is gone from the browser.** The replay
no longer shows "what the config looked like before and after THIS merge", nor
the toggle that re-framed a stop against the pre-rules base. Two successors,
and they are why the loss is affordable:

- **In-browser:** the stop list states which keys each stop wrote, and the
  verdict card's threads (054) already carry the per-KEY version of the same
  story — every writer, the value it wrote, and who beat it. That is what
  readers came to the stepper's diff for, keyed by the thing they were asking
  about instead of by position.
- **Headless:** `rcd simulate <config> --dep … --detail full` returns the whole
  `SimulationResult` — `mergeSteps` with both snapshots per merge, verbatim —
  and `rcd compare` diffs two runs for one dependency. The reader who really is
  stepping through a merge has the unprojected document one flag away.

## Consequences worth stating

- 080's "**`mergeStepIndex` / `view.simStep`** share plumbing is untouched"
  is superseded by this doc (the line stays in 080 with a pointer here —
  rulings record what was true when written).
- A share link can no longer point INTO the replay. 047's "a link's `simStep`
  arrives with the merge drawer open" was the only reason the drawer had a
  non-`false` initial state; it starts closed for everyone now.
- The 2026-08 readability research's Jaeger transplant ("a persistent compact
  timeline with a single detail pane beats N stacked full diffs") argued the
  shape 046 shipped. It survives in the half that mattered: the stops are all
  visible and ordered. The detail pane it protected against N full diffs is
  gone because the N full diffs are gone with it.

## Verification

- New `features/simulator/SimMergeBody.test.tsx` (components project) pins the
  kept content in the fast suite the Stop hook runs — the five stops in merge
  order with their counters, each rule stop naming its rule and its keys, the
  flatten stop's consumed-block sentence, the final stop's config + Copy, and
  the no-merge fallback disclosure.
- `share.test.ts`'s two `simStep` suites are re-pointed rather than deleted:
  one asserts the field still passes the codec unchanged (decoded, then
  ignored), the other that a pre-044 link decodes as it always did and a
  malformed `simStep` is still dropped alone. `input-schemas.test.ts`'s
  sanitizer case is unchanged, its comment re-pointed.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, app `test:unit`
  (124 files / 1145 tests) — all green. `src/class-coverage.test.ts` is what
  proves the CSS retirement is exact in both directions.
- e2e updated, not run here: `04-simulator`'s stepper case becomes "the merge
  replay lists every stop, in merge order" (no chips, no Prev/Next, no
  cumulative toggle; the flatten and final stops asserted by content), the two
  cross-link cases assert the named stop is in the viewport, and
  `17-verdict-threads`' link case keeps its `simStep` deliberately — it is now
  the decode-and-ignore assertion.
