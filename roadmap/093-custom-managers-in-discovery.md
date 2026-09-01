# 093 — Custom managers in repo discovery

Milestone: M21 · Status: in progress · Delivers the repo-walk half that
[063](063-custom-manager-extraction.md) §4.2 kept the door open for; the
paste-a-file Extraction tab of 063 stays deferred. Feasibility:
[2026-08-custom-manager-simulation-feasibility.md](2026-08-custom-manager-simulation-feasibility.md).

## The ask

A config with `customManagers` shows none of that manager's dependencies in
the Dependencies tab, silently. Three stacked reasons, each sufficient on its
own:

1. **The walk never consults the config.** `matchExtractableManagers` iterates
   the bundled per-manager default configs filtered to the curated extractor
   set; a custom manager's `managerFilePatterns` live in
   `config.customManagers[]`, which discovery never receives. A file only a
   custom manager claims never enters the ledger — not even as `not-read`.
2. **Extraction can't run one.** `managerExtractors` has no `regex`/`jsonata`
   entries, and `extractDeps` hands every extractor an empty config — while
   the custom extractors are precisely the ones meaningless without their
   block (`matchStrings`, templates).
3. **The gap is silent.** Discovery caveats report what became of _matched_
   files; an unmatched file fires nothing, and `managersConsidered` doesn't
   count custom blocks either.

## Scope

- **Engine** — `custom/regex` + `custom/jsonata` extractor re-exports (the
  spike proved both browser-safe, no new shims);
  `matchExtractableManagers(paths, { customManagers })` claims paths per
  enabled block, labeled `custom.regex`/`custom.jsonata`, with per-path block
  indexes and a `customManagersConsidered` count; `extractCustomDeps` runs one
  block's extractor **with the block itself as config**, queued like every
  other engine task, throw-safe (`extract-error`, never an unhandled reject).
- **App** — the shell passes the run's `finalConfig.customManagers` into
  `useRepoDeps`; `discover()` threads them into the walk, fetches
  custom-claimed files, runs each claiming block per file and merges outcomes;
  the discovery key includes the custom-manager set, so a config edit that
  changes them re-discovers. The Extract phase's denominator grows the
  anticipated "+ M custom" suffix (the comment in `extract-phase.ts` predates
  this doc).

## Decisions

- **The block is the manager instance.** Attribution is by custom type
  (`custom.regex`), deduped per path; which _blocks_ claimed a file rides
  separately (`customBlocks` indexes) because extraction must run per block —
  two regex blocks with different `matchStrings` legitimately both extract
  from one file.
- **RE2 stays a documented gap** (feasibility §3): extraction uses upstream's
  own code path (native `RegExp` fallback), no `re2js` oracle in this slice.
  Named-group-only patterns — all 60 of upstream's bundled preset
  `matchStrings` — behave identically in both engines.
- **No run, no custom managers.** Discovery before a run (or on a refused
  config with no `finalConfig`) walks built-ins only, exactly as today; the
  custom claims appear once a run supplies the blocks. That is Renovate's own
  ordering: custom managers exist only in a resolved config.
- **CLI/MCP parity is a follow-up**, not this slice: `rcd extract` and
  `extract_deps` keep their single-file, config-less contract for now.
- **The ledger carries the failure's reason.** A block whose `matchStrings`
  throws produced `{ outcome: "error" }` and nothing else, so the row said
  "extraction failed" about the reader's own config without naming the cause.
  `RepoDepFile.error` holds the engine's message (merged only where the file's
  outcome IS the failure), and the file row's expanded body prints it. Renovate's
  own validation reports a broken pattern too — this is the second channel, for
  the failures validation cannot see (a pattern that parses but throws at
  extraction time), not the only one.

## Non-goals

The 063 Extraction tab (paste files, span-level match evidence, discard
reasons), the `re2js` verdicts, and applying `enabledManagers`/`ignorePaths`
from the merged config to the walk (still footnoted honestly).
