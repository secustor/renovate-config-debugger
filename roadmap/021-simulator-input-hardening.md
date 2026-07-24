# 021 — Simulator input hardening + A/B comparison integrity

Milestone: M7 · Status: done

## Summary

Three of nine sessions in [replay #1](2026-07-persona-replay-01.md) mangled a
simulator input the same way: a quick-fill chip or a pipeline re-run leaves
unselected text in a field, the next keystrokes append, and the persona
simulates "reactgradle" without noticing. Separately, the 018 pin/compare
panel compares pinned-A against current-B even when the inputs differ (a
gradle run was silently compared against a lodash pin) — an easy path to a
wrong conclusion presented with full confidence.

## User story

As a user iterating on simulations, I want fields I re-target to replace
rather than extend their old content, and I want the A/B panel to tell me
when I'm comparing runs of two different hypothetical updates — so a wrong
conclusion can't come from stale characters or mismatched baselines.

## Scope

- Select-on-focus (or an explicit one-click clear) for simulator text
  fields; quick-fill chips leave fields in a state where typing replaces.
- The A/B pin snapshots the full input descriptor with the result; the
  comparison panel shows both input sets and warns prominently (or refuses)
  when they differ.
- Optional: named pins / a second pin slot (both advanced and expert built
  multi-baseline comparisons by hand).

## Out of scope

- Registry lookups for real dependency metadata (see 015's out-of-scope; the
  "prefill sourceUrl from the datasource" wish stays a possible follow-up).
- Named pins / a second pin slot: the single-pin design already needed a real
  rework here (the pin now snapshots the whole form, not just the result) —
  stacking a multi-slot UI on top in the same pass risked the comparison UI
  itself for a want (multi-baseline comparisons, built by hand today) rather
  than the wrong-conclusion bug this item exists to fix. Left for a
  follow-up if the single-pin-plus-mismatch-warning combination turns out
  not to be enough.

## Dependencies

- 006 (simulator), 015 (input form), 018 (pin/compare).
