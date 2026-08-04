# 063 — Custom-manager extraction: simulate what a `matchStrings` regex finds

Milestone: M17 · Status: proposed — deferred until the current feature set has
stabilized. Renumbered from 057 (2026-08-05); main took 056–061.
Feasibility proven:
[2026-08-custom-manager-simulation-feasibility.md](2026-08-custom-manager-simulation-feasibility.md)

## Summary

A `# renovate: …` comment with one character wrong extracts nothing, silently,
and the author finds out weeks later — the complaint behind
[renovatebot/renovate#45071](https://github.com/renovatebot/renovate/discussions/45071),
which asks upstream for a `warnOnMismatch` option. This app can answer the
question without waiting for that: paste the config **and** a sample file, and
see which spans matched, what each match extracted, and which near-misses were
discarded and why.

Every stage the app traces today stops at a resolved config. This is the first
that takes a **package file** as input, which is the whole of the new surface —
the extraction itself is upstream's own code, unmodified.

## User story

As someone who just wrote a custom manager, I want to paste a file and see what
Renovate would extract from it, so that I learn my regex is wrong now rather
than from a dependency that never updates.

## Scope

- **Engine** — `simulate-custom-managers.ts` beside `simulate-package-rules.ts`,
  in two deliberately separate steps (see Decisions):
  1. path-only matching via upstream `getMatchingFiles` (`managerFilePatterns`,
     `includePaths`, `ignorePaths`) — touches no file content;
  2. per-file `extractPackageFile` for `custom.regex` and `custom.jsonata`.
- Three new re-exports in `renovate-adapter.ts` (the two extractors and
  `getMatchingFiles`) — the boundary rule holds, nothing else deep-imports.
- Discard reasons come from the logger shim: `checkIsValidDependency` already
  emits a `logger.trace` carrying the partial dependency, so "matched but
  thrown away, and here is what was missing" needs no new instrumentation.
- Matched spans are located by `indexOf(replaceString)` — upstream's own
  auto-replace anchor — so nothing re-runs the regexes and drifts from them.
- **Input** — `ConfigColumn` grows a set of `{ path, content }` pairs.
- **Results** — the `Extraction` tab from 062.

## Decisions

- **The files are input, so they live in `ConfigColumn`** — the input half of
  the split, alongside the config editor and its toolbar. Not a results tab,
  not a modal.
- **The path is a first-class, editable field**, not a caption.
  `managerFilePatterns` matches against it, so `Dockerfile` and
  `docker/Dockerfile.ci` give different answers; a fixed or implied filename
  would quietly answer a different question than the one asked.
- **More than one file must be representable.** "Which of my files does this
  manager miss?" is the question; a single-file input answers a strictly weaker
  one.
- **`ConfigColumn` takes the file set as one grouped prop** (or an
  already-constructed element, the pattern `advancedZone` uses). It is
  presentational with ~30 flat props already; adding an n-file list flat would
  make it unmanageable. The list is its own component under `features/editor/`
  — `jsx-max-depth: 3` forces that decomposition up front.
- **Extraction runs on demand, per file — never as a batch over the set.** Cost
  scales with `files × managers × matchStrings`, each sweep carrying upstream's
  10 000-iteration cap plus handlebars compilation per matched dependency, and
  it would land on the typing path that the `render` vitest project exists to
  protect. Results are memoized per `(content, manager config)`; anything shown
  across all files at once (e.g. "3 files matched no dependencies") is derived
  from the cheap path-only step, with content extraction still deferred until a
  file is opened.
- **Only what upstream computes is shown.** No re-implementation of the
  matching, no invented "why didn't this match?" narration beyond what the
  trace actually contains — 064 adds the honest version of that.

## Not in scope

- RE2 fidelity warnings and unmatched-comment detection → **064**.
- Populating the file set from a repository (007's fetch path, at repo scale).
  The two-step split above is what keeps that tractable later; this item must
  not foreclose it.
- Non-custom managers. Simulating `npm` or `gradle` extraction means the whole
  manager registry and a very different bundle conversation.

## Verification

- Engine: a golden/shimmed pair on RE2-safe fixtures, holding the byte-identity
  invariant. Fixtures include the discussion's own failure — a correct
  `# renovate:` comment and a typo'd one in the same file, asserting one
  extraction and one silence.
- App: a `render`-project test that typing in the config editor does **not**
  trigger extraction, which is the performance decision made executable.
- e2e: paste a Dockerfile, open `Extraction`, see the dependency and the
  matched span.
