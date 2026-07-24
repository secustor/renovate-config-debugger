# 022 — Verdict & translation copy precision

Milestone: M7 · Status: planned

## Summary

[Replay #1](2026-07-persona-replay-01.md)'s experts want to paste the tool's
sentences into discussion-board answers, and found three places the prose
fails that bar: the 43936 translation's rationale is factually wrong ("the
other patterns already covered every case `*` did" — false for a
negation-only array; the equivalence holds because negative-only arrays
imply match-all-except); the 018 "skipped — no sourceUrl set" clause state
reads as "not evaluated" when upstream semantics are a fail-closed `false`;
and the verdict sentence emits no-op clauses ("add labels []", "only run on
schedule [at any time]") that must be hand-edited out before quoting.

## User story

As an expert answering someone's config question, I want every sentence the
tool renders to be quotable verbatim — factually right, no filler clauses,
naming its evidence — so citing the tool doesn't cost me a correcting
paragraph.

## Scope

- Fix the redundant-`*` translation rationale: state the actual rule (a
  negative-only pattern array implicitly matches everything not excluded),
  link the matcher docs section.
- Reword the fail-closed clause state: "evaluated false — the simulated
  dependency has no sourceUrl (Renovate treats a missing value as a
  non-match)" instead of "skipped", keeping the tri-state distinction from
  018 (matched / evaluated false / not applicable).
- Suppress empty/no-op clauses from the verdict sentence; attribute
  update-type scoping to its source preset in the quotable sentence
  ("automerge is scoped to minor/patch — from `:automergeMinor`").
- Stretch: a combined "quote this verdict" export — verdict sentence +
  preset body excerpt + rule delta + version pin as one markdown block (the
  pieces exist behind separate copy buttons).

## Out of scope

- New verdict semantics; this is wording and export only.

## Dependencies

- 012 (verdict block), 014 (translations), 018 (clause states,
  copy-as-markdown).
