# 026 — Treat `$schema` as a first-class option

Milestone: M7 · Status: planned

## Summary

User-reported (2026-07-24). `$schema` is standard practice in
`renovate.json` (the default and example configs both ship it), and
Renovate's validator accepts it — the app's Validate stage reports 0
errors. But the app still presents it as suspect in two places: the
Effective config row renders `$schema` with the red "unknown option"
squiggle (it's absent from the 003 option-docs index, so it falls into the
unknown-name styling), and the Presets-stage diff shows it on the removed
side with no explanation (upstream drops it from the resolved output, which
is correct but reads as "rejected").

## User story

As a user whose config starts with `$schema`, I want the tool to treat it
like the well-known key it is — no red underline, a hover card explaining
what it's for — so I don't burn time investigating a non-problem.

## Scope

- Add `$schema` to the option index / known-keys set with a proper hover
  card ("points editors at Renovate's JSON schema for autocomplete and
  inline validation; ignored by Renovate itself") and a docs link.
- Remove the unknown-option squiggle for it everywhere the index is used
  (editor hovers, effective config rows).
- Annotate its removal in the Presets/Merge diff (or filter it from the
  "removed" presentation): "editor-only key, dropped from the resolved
  config" — the current red row without context reads as an error.
- Verify no validation path flags it (none found today; add a test so a
  future renovate bump that starts flagging it is caught deliberately).

## Out of scope

- Fetching or validating against the schema file itself.

## Dependencies

- 003 (option index).
