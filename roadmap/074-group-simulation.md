# 074 — Group-level simulation: would this group actually form?

Milestone: M19 · Status: in progress

## Summary

`simulate` evaluates the packageRules against ONE hypothetical update, by
construction. That makes a whole class of question unanswerable: grouping is a
property of a SET of updates, and `minimumGroupSize` is a gate over that set.
Persona replay 03 named the gap precisely — both entry-level sessions on the
`44529` scenario ("why does this group wait?") produced correct diagnoses of
everything the tools could see, then had to hedge the one question the scenario
was actually about: _"given N pending updates, would the group meet its
minimum?"_ Their reports called it "a real gap for this bug class, not an
inconvenience", and it was the only question in the study no tool on either
transport could close.

This layer answers it with arithmetic the engine already knows how to produce:
`rcd group` (CLI) and `simulate_group` (MCP) take SEVERAL updates, run the
same per-dependency evaluation `simulate` runs for each, and tally the results
by the `groupName` each update's matching rules produced.

## What it models, and what it refuses to

Each supplied update is simulated exactly as `simulate` would (same
`simulatePackageRules`, same updateType derivation, same missing-input
accounting). From each per-dependency config the tally reads three keys:

- `groupName` — membership. Unset means ungrouped: that update gets its own PR.
- `groupSlug` — carried through when set; branch names build on it.
- `minimumGroupSize` — the gate. Absent or non-numeric reads as Renovate's
  default of 1 (no gate).

Per group the answer is `members`, `size`, `minimumGroupSize`, `wouldForm`
(`size >= minimumGroupSize`) and a one-sentence citable `verdict` — the same
verdict-first shape roadmap 048 established for `simulate`.

Three honesty rules, all stated in the answer's `notes` rather than assumed:

1. **The tally is over the supplied list.** Renovate evaluates
   `minimumGroupSize` against the repository's real pending updates at run
   time. `wouldForm: false` means "these updates alone don't reach it", never
   "this group can never form". The scope note travels on every answer.
2. **Members that disagree on the gate are named.** `minimumGroupSize` is
   rule-scoped, so two members of one group can carry different values; inside
   Renovate the effective value is then ordering-dependent. The tally takes
   the largest (the conservative reading), reports the spread in
   `minimumGroupSizeValues`, and says so in a note.
3. **This is not a branch simulator.** `separateMajorMinor`,
   `separateMultipleMajor` and custom `branchName` templates can split one
   groupName across branches; modeling that would mean reimplementing the
   branchifier against a moving target. Membership is by `groupName` as the
   rules resolved it, and the note says exactly that.

A member whose descriptor left rule inputs unset is flagged per member (same
reasoning as `compare`'s per-side notes): a rule that would have grouped it
reported a plain `no-match`, so a blind tally reads as "these updates just
don't group".

## Surface

- **CLI**: `rcd group <file> --dep '{…}' --dep '{…}'` (repeatable) or
  `--deps-file updates.json` (JSON array of the same objects). At least two
  updates — one update is `simulate`'s question, and the error says so.
  `--dep` became repeatable in the shared option table; `simulate`/`compare`
  reject a second occurrence with a pointer at `group` instead of silently
  taking the last one.
- **MCP**: `simulate_group { runId, deps: [DEP, …] }` (min 2, enforced by the
  schema) over a held run. Same projection, same notes; the instructions
  paragraph names it next to `simulate`.

The tally lives in `projections/group.ts`, shared by both transports like every
other projection since roadmap 070, and is pure over
`{ dep, finalDependencyConfig }` pairs — the unit tests never run the pipeline.

## Deliberately out of scope

- Auto-deriving the update list from a repository (lock files, datasource
  lookups) — the debugger simulates hypotheticals; fetching real pending
  updates is Renovate's job.
- Per-group schedule/branch-concurrency reasoning (`prConcurrentLimit`,
  `schedule`) — different gates, different questions, and none of them were
  the replay-03 gap.
