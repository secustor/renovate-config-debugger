# 012 — Simulator: verdict-first results + update-type flattening

Milestone: M5 · Status: planned

## Summary

The 2026-07 persona study ([study report](2026-07-persona-ux-study.md)) found
the simulator's _evidence_ is excellent but its _answer_ is missing or buried:
it never applies Renovate's update-type flattening (so "will this update
automerge?" is unanswerable — a minor update still shows top-level
`automerge: false` with `minor: {automerge: true}` unmerged), and the verdict
sits below ~710 "no match" rows. All 9 personas hit the second problem; the
expert failed a goal on the first.

## User story

As a user simulating an update, I want the simulator to open with the answer —
"this major update WOULD get labels `[deploy_pr]` and auto-approval, but would
NOT automerge (automerge is scoped to minor/patch)" — and show me only the
rules that matched, instead of making me scroll 700 rows to assemble the
conclusion myself.

## Scope

- Engine: after the packageRules merge tail, apply the update-type flattening
  step (`mergeChildConfig(config, config[updateType])`, as upstream
  `flattenUpdates` does) so the resolved per-dependency config reflects the
  update's type. Oracle-parity test against upstream, like the rest of 006.
- A verdict block pinned directly under the Simulate button: matched-rule
  count, the changed keys **with their final values** (not key names only),
  and a plain-language outcome sentence covering the high-signal options
  (automerge, labels, grouping, enabled/disabled + skipReason, schedule).
- Results list defaults to **matched rules only**, with a "show all N" toggle;
  "3 of 713 rules matched" becomes a jump link to the matches.
- Keep per-clause evidence rows exactly as they are — every persona praised
  them ("the money shot").

## Out of scope

- Rule provenance chips and rule-numbering cross-links (013).
- Input-form ergonomics (015).
- A/B comparison of two simulation runs (018).

## Dependencies

- 006 (simulator engine + oracle tests).
