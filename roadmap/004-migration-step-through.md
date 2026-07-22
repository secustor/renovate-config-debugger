# 004 — Migration step-through

Milestone: M2 · Status: planned

## Summary

Show config migrations one at a time as individual diffs instead of a single
before/after blob. Renovate's `lib/config/migrations/` is one class per
migration, which maps naturally to a stepper UI: each step names the
migration, shows its diff, and explains why the old form is deprecated.

## User story

As a user with an old config, I want to see each rewrite Renovate silently
applies (e.g. `packageRules[].packageNames` → `matchPackageNames`, semantic
commit options, `binarySource` values) as a discrete, explained step, so I can
confidently commit the migrated config myself.

## Scope

- Engine: run migrations individually (iterate the migration classes /
  instrument `MigrationsService`) and emit one `migration-applied` event per
  migration that actually changed something.
- Stepper UI: previous/next through applied migrations, cumulative diff view,
  jump-to-end.
- Per-step explanation text; start from the migration class name + option
  metadata (deprecation messages), maintain a small curated
  explanation map for the common ones.
- "Copy migrated config" action (equivalent of what the
  `config-migration` PR would produce).
- Show this both for the repo config and per-preset (presets are migrated on
  fetch — link from preset tree nodes to their migration steps).

## Out of scope

- Writing migration PRs back to a repo.

## Dependencies

- 001. UI integrates with 002's preset nodes when both exist.

## Risks

- `MigrationsService` may apply migrations in ways that aren't cleanly
  separable per class (ordering, repeated passes until stable). May need to
  diff between passes rather than between classes; validate in a spike.
