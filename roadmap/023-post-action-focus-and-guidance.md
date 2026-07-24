# 023 — Post-action focus, honest error states, rule-filter shortcuts

Milestone: M7 · Status: done

## Summary

Navigation and state-honesty gaps from [replay #1](2026-07-persona-replay-01.md).
Apply fix re-runs the pipeline and lands the user on the Presets diff — the
question they actually have ("is the error gone?") is answered on Validate,
which they must find themselves. Pipeline re-runs reset scroll position.
The simulator happily evaluates a config whose validation failed, with
nothing saying a real Renovate run would refuse it. And the most common
wish across all nine sessions: a "why didn't my rule match?" shortcut —
finding your own rule among 713 still takes "show all" plus hunting.

## User story

As a user acting on the tool's advice, I want each action to land me on its
consequence (fix → validation result), the tool to tell me when what I'm
looking at is hypothetical (invalid config still simulated), and my own
rules to be one click away in any rule list.

## Scope

- Apply fix returns to (or toasts) the Validate outcome: "re-ran — 0
  errors"; preserve scroll position across pipeline re-runs (016 covered
  re-simulations; runs still reset).
- A banner on post-Validate stages and the simulator when validation
  errors exist: "a real Renovate run would refuse this config; results
  below show what it _would_ do."
- "My rules only" filter in the simulator results (repo-config provenance
  already known from 013), pre-expanded clause evidence for those rows.
- Editor affordance for preset strings: hovering `:automergeMinor` in the
  config editor currently shows a bare "string" type tooltip; surface the
  preset inspector content (or at least a glossary card + jump link) where
  the cursor already is.
- Make the "(= merged rule packageRules[N])" annotation in validation
  messages visibly interactive or visibly informational — entry users click
  it and conclude it's broken.

## Out of scope

- Layout restructuring of the long page (the collapsed-by-default Presets
  diff idea belongs to a broader information-architecture pass).

## Dependencies

- 013 (provenance), 014 (apply fix), 016 (scroll ergonomics).

## Delivered

- Apply fix re-runs preserving scroll, selects the Validate stage, and toasts
  the fresh error count ("re-ran: 0 errors"); Run / preset-injection re-runs
  also preserve scroll (best-effort, restored after paint — no flaky e2e
  assertion on the exact offset).
- `HypotheticalBanner` on the presets/merge stage diffs, the effective config
  and the simulator, shown only when the Validate stage reports errors.
- Simulator "my rules only" filter (repo-config provenance from 013), the
  filtered rows pre-expanded to their clause evidence.
- Editor preset-string hovers: a Renovate-preset card with a short description
  from the resolved tree and a "Show in resolution tree" jump link, replacing
  the bare "string" schema tooltip for known preset strings (available after a
  run, when the resolution tree exists).
- The `(= merged rule packageRules[N])` annotation stays interactive but no
  longer dead-clicks before a simulation: it lands the user on the simulator
  with a hint to run one.

## Deferred

- None. Preset-string hovers need a completed run (the resolution tree is what
  identifies a string as a preset); before the first run the schema tooltip
  still shows, unchanged.
