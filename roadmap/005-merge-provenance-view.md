# 005 — Merge provenance view

Milestone: M2 · Status: planned

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
