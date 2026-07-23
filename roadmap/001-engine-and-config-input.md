# 001 — Trace engine + config input

Milestone: M0/M1 · Status: done 2026-07-23 (M0 spike passed; engine, tests,
app shell, CI + Pages deploy implemented and verified end-to-end in the
browser)

## Summary

The foundation everything else renders: a `packages/engine` library that runs
a config through Renovate's real pipeline stages (parse → migrate → massage →
validate → preset resolution → merge, mirroring Renovate's own order) and
records a structured **trace** of typed events with before/after snapshots.
Plus the minimal UI to feed it: a paste-in config editor.

## User story

As a Renovate user, I paste my `renovate.json` (or JSON5) into the app and get
the fully processed effective config, with any validation errors shown —
produced by Renovate's own code, not a reimplementation.

## Scope

- pnpm workspace with `packages/engine` and `packages/app`.
- Engine deep-imports `renovate/dist/config/**`; all deep imports isolated in
  a single adapter module.
- Browser shims (a Vite `resolveId` plugin shared with the shimmed Vitest
  project) for `lib/logger`, `lib/util/cache/package`, and Renovate's rolldown
  runtime helper; the Node HTTP stack is kept out of the bundle by severing
  the datasource subtree at `modules/datasource` and fetching presets with
  browser `fetch()` instead of aliasing `lib/util/http/*`.
- Trace event model (see spec) with JSON-patch deltas per stage.
- Input editor (CodeMirror 6 — chosen over Monaco: ~3 MB lighter, and
  `codemirror-json-schema` validates JSON5 against `renovate-schema.json`,
  which Monaco's JSON service cannot) with schema squiggles.
- Stage timeline UI: parse ✓ → migrate ✓ → … with the config snapshot after
  each stage viewable as a diff against the previous stage.
- Golden tests: engine's final output deep-equals real Renovate's output for a
  set of fixture configs (run in Node CI).
- Displayed engine version badge ("Renovate vX.Y.Z").

## Out of scope

- Fetching configs from repos (007), global/inherited layers (008).

## Dependencies / risks

- M0 spike gates this: if Renovate internals can't be bundled for the browser
  with reasonable effort, fall back to the CLI+viewer architecture (spec
  Risks table).
