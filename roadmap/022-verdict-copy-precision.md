# 022 — Verdict & translation copy precision

Milestone: M7 · Status: done

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

## Implementation notes

- Redundant-`*` translation (`packages/engine/src/error-translations.ts`):
  reworded to state the actual rule — a negation-only remaining array already
  matches everything it doesn't exclude, which is why dropping `*`/`**` is
  equivalent in that case (and why it ISN'T when a remaining pattern is a
  plain positive) — and links
  `https://docs.renovatebot.com/string-pattern-matching/#negative-matching`
  instead of the generic per-option docs page.
- Fail-closed clause wording (`packages/engine/src/simulate-package-rules.ts`,
  rendered in `packages/app/src/components/RuleSimulator.tsx`): `no-input`
  clauses now read "evaluated false — the simulated dependency has no
  \<field\> (Renovate treats a missing value as a non-match)" instead of
  "skipped — no \<field\> set …". The tri-state (`no-match` / `no-input` /
  `not-applicable`) is unchanged; only prose and the `no-input` icon's
  tooltip framing moved.
- Verdict sentence (`buildVerdictSentence` in `RuleSimulator.tsx`): empty
  `labels`/`addLabels` and the default unrestricted `schedule: ["at any
time"]` are now suppressed as no-ops instead of rendered as clauses.
  Automerge update-type scoping cites its source preset ("— from
  `:automergeMinor`") when every scoped update type traces to the same
  preset via the existing `computeRuleProvenance` data; left uncredited when
  the source is mixed or unknown.
- Deferred: the combined "quote this verdict" export (stretch). The other
  three pieces (preset body excerpt, rule delta, version pin) live behind
  copy buttons in unrelated components (`PresetTree.tsx` for preset bodies)
  with no shared plumbing back to the simulator's verdict block; wiring them
  together cleanly would mean prop-drilling preset text through `App.tsx`
  into `RuleSimulator`, which didn't fit in this pass. Left for a future
  item if wanted.

## Dependencies

- 012 (verdict block), 014 (translations), 018 (clause states,
  copy-as-markdown).
