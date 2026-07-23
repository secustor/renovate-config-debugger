# 015 — Simulator input ergonomics

Milestone: M5 · Status: done 2026-07-24

> Implemented as specified. `sourceUrl` is now a primary field (next to
> currentValue/newValue) with a placeholder and a glossary hover card that
> names it as the DEPENDENCY's repo and cross-references `repository` (also
> given a hover card) as the repo Renovate runs in. `updateType` derivation
> wraps Renovate's own `getUpdateType` plus its versioning `get()` lookup
> (`packages/engine/src/version.ts`'s `deriveUpdateType`, both re-exported
> through `renovate-adapter.ts`'s import boundary) — live in the form via a
> "(derived)" hint next to the select, and independently recomputed inside
> `simulate()` at run time so a manual override always wins but a stale
> quick-fill value never silently survives an edited version pair. The
> empty-form guard and the stale-results veil are both reactive: the guard
> clears itself the moment any field gets content, and staleness now dims the
> entire results block (not just the small text hint) under a banner that
> stays full-strength. Added a `nuget` quick-fill chip. The updateType
> select's arrow-key handling is now done manually in JS rather than left to
> the browser — investigation traced the reported "arrow keys ignored" not to
> any app bug (a bare, JS-free `<select>` under the same automated-browser
> driver used by the persona study reproduces the identical non-response),
> but per-option manual stepping is deterministic everywhere regardless, so
> it's implemented anyway as a robustness fix.

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
