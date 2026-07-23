# 005 — Merge provenance view

Milestone: M2 · Status: done 2026-07-23

> Implemented as specified, computed post-hoc — no Renovate instrumentation.
> `computeProvenance` replays Renovate's real `mergeChildConfig` over the
> top-level layers already captured in the trace (defaults → each directly
> extended preset in order → repo config), attributing every top-level key to
> the layer(s) that produced its final value. Because `mergeChildConfig` is
> pure this reproduces the pipeline's merge exactly; the replay is top-level
> only (`root.children`), so it stays a handful of merges even for
> `config:recommended`. A final correction pass reconciles Renovate's
> nested-`extends` expansion (repo `packageRules[n].extends`) against the
> ground-truth resolved config, and `force` wins are attributed per merge call
> since Renovate re-flattens `config.force` on every call. The view replaces
> the old value-equality filter: default-only keys are hidden behind a toggle,
> a key explicitly set to its default value now correctly shows as set by that
> layer. Clicking a preset badge in a chain selects that node in the resolution
> tree (the cheap half of 011's reverse lookup).

## Summary

The effective config, where every key answers "who set this and who got
overridden": defaults → global → inherited → each preset (in order) → repo
config. The per-key complement to 002's per-preset tree.

## User story

As a user seeing `automerge: true` in my effective config, I want to click the
key and see the full override chain — which preset introduced it, which layer
overrode it, and what the losing values were — so I can find where to change
it.

## Scope

- Engine: track provenance during merging by recording each
  `mergeChildConfig` call as a `merge` trace event and attributing key-level
  changes via the deltas (arrays: note Renovate's merge semantics — some keys
  concatenate, e.g. `packageRules`, per `mergeChildConfig` behavior).
- Effective-config view where every key is annotated with its winning source
  layer (color-coded badge), expandable to the full override chain with
  losing values struck through.
- Filter/search: "show only keys set by preset X", "show only overridden
  keys".
- Defaults handling: distinguish "explicitly set to the default value" from
  "default because nothing set it" — hide the latter by default with a
  toggle to show the fully hydrated config.

## Out of scope

- `packageRules` _matching_ (which rule applies to which dependency) — 006.

## Dependencies

- 001, 002. This is the feature that makes 008 (global/inherited layers)
  meaningful.
