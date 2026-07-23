# 004 — Migration step-through

Milestone: M2 · Status: done 2026-07-23

> Implemented as specified. ESM live bindings can't be monkey-patched, so
> `migrateConfig` is instrumented the same way the rest of the engine is: a
> faithful line-for-line fork of `config/migration.js` lives in
> `src/shims/migration.ts` and the vite shim plugin swaps it in. The fork
> re-uses Renovate's REAL `MigrationsService.getMigrations` / `getMigration`
> (never re-listing the registry) and clones the shared migratedConfig around
> each `migration.run` + deprecated-delete to detect what a class actually
> changed; synthetic steps wrap the non-class post-processing (template
> rewrites, language→packageRules, nested packageRules flattening, pip-compile,
> gradle-lite). A shared `{root, path}` context is threaded through the
> recursion so every step carries a full-document before/after snapshot (the
> full path-threading, not the fallback) — the cumulative diff and per-preset
> grouping come straight from the event stream. Steps reuse the
> `migration-applied` event kind with a new `migration` field (name, className,
> key/newKey, parentKey, pass, presetName, explanation); the pipeline dropped
> its old aggregate migration blob but keeps stage-complete as the fallback
> view. The collector stage-gates steps to migrate/preset so validation-time
> migrateConfig calls stay out of the stream, and reads the currently-resolving
> preset from the preset-tree builder. `dequal` and the `@sindresorhus/is`
> predicates the fork needs are vendored verbatim (they're unresolvable
> Renovate transitive deps). A golden drift tripwire hashes the two upstream
> sources so a renovate bump forces a re-diff. The absolute fidelity net —
> shimmed `finalConfig` equals the golden output — is unchanged and still green.

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

- 1. UI integrates with 002's preset nodes when both exist.

## Risks

- `MigrationsService` may apply migrations in ways that aren't cleanly
  separable per class (ordering, repeated passes until stable). May need to
  diff between passes rather than between classes; validate in a spike.
