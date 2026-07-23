# 015 — Simulator input ergonomics

Milestone: M5 · Status: planned

## Summary

The persona study showed the simulator's inputs undermine its (excellent)
evaluation: `sourceUrl` — the decisive matcher in two of the three real-world
problems studied — is hidden behind "More fields"; the adjacent `repository`
field invites the wrong guess for a repo URL (guessing wrong flips the
conclusion); `updateType` is not derived from the versions (a quick-fill's
`patch` silently survived a 18.2.0 → 19.2.0 edit); an empty-form Simulate
reports "0 of 714 rules matched" with no hint (one persona read it as "my
broken rule disabled everything").

## User story

As a user copying facts out of a bot PR (package, versions, repo URL), I want
the form to accept them where I'd expect, infer what it can, and stop me from
running a meaningless simulation — so a wrong conclusion can't come from a
misplaced input.

## Scope

- Promote `sourceUrl` to the primary fields; disambiguate it from
  `repository` with examples in the placeholders/hover docs.
- Derive `updateType` from currentValue/newValue via the selected versioning
  scheme (manual override wins; show "major (derived)").
- Empty-form guard: Simulate with no meaningful input prompts "pick an
  example or fill in a package first" instead of rendering 714 no-matches.
- Stale results: grey out the previous result list when inputs change (the
  small orange hint alone was skimmed past twice in the study).
- Add a `nuget` quick-fill chip (Azure DevOps users); fix the `updateType`
  select ignoring arrow keys.

## Out of scope

- Looking up a package's real sourceUrl from its registry (needs datasource
  network calls; possible follow-up for npm only).
- Verdict/results-list rework (012).

## Dependencies

- 006 (simulator).
