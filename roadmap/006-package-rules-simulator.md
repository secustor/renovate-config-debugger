# 006 — packageRules simulator

Milestone: M3 · Status: planned

## Summary

The "predict what will happen" feature: describe a hypothetical dependency
update (manager, datasource, package name, current/new version, file path,
update type) and see which `packageRules` match, in order, and the final
per-dependency config Renovate would use for it.

## User story

As a user, I want to ask "what happens when `lodash` gets a minor update in
`package.json`?" and see each `packageRules` entry evaluated — matched or not,
and *why* (which `match*`/`exclude*` clause decided it) — plus the resulting
merged config (grouping, automerge, schedule, labels…).

## Scope

- Engine: reuse Renovate's `lib/util/package-rules/` matchers directly against
  a user-supplied synthetic `PackageRuleInputConfig`.
- Input form for the dependency descriptor with sensible presets (npm dep,
  Dockerfile image, GitHub Action, …).
- Rule-by-rule evaluation list: each rule shows pass/fail per matcher clause
  (`matchPackageNames: ❌ no pattern matched "lodash"`), with the effective
  config diff for matching rules.
- Final resolved dependency config, with provenance (005) extended to rule
  level.
- Batch mode (stretch): paste a list of dependencies and see which rules each
  hits — useful for validating grouping strategies.

## Out of scope

- Real dependency extraction from manifests, datasource lookups, actual
  scheduling evaluation against a clock (a `schedule` *explainer* could be a
  follow-up).

## Dependencies

- 001, 005. The matcher modules must survive the same browser-shim treatment
  as the config code — needs a short spike.
