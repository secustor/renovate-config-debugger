# 078 — Dependency proposals: extract real deps from a pasted package file

Milestone: M17 · Status: proposed — after 062 (tab taxonomy) and 063 (the
file-set input this rides on); independent of 064.
Feasibility surveyed:
[2026-08-builtin-extraction-feasibility.md](2026-08-builtin-extraction-feasibility.md)

## Summary

Every dependency the simulator or the Tests tab has ever seen was hand-typed
into a form — depName, currentValue, datasource, manager, packageFile, each a
chance to test a dependency that doesn't exist in the shape the user typed it.
The real answer is sitting in their repository: paste a `package.json`, a
`Dockerfile`, a workflow file, and Renovate's own `extractPackageFile` says
exactly which dependencies it sees and how it names them. This item runs the
built-in managers' extraction in the browser and turns the result into
**proposals** — one click to pin a real dependency as a test, or to load it
into the simulator form.

063 built extraction for _custom_ managers and explicitly deferred built-in
ones ("the whole manager registry and a very different bundle conversation").
The survey had that conversation: the extract functions are mostly pure
`string → deps` parsers, all file access goes through one shimmable choke
point, and per-manager deep imports avoid the 2.8 MB barrel. Two new shims,
one engine module, one UI slice.

## User story

As someone testing my packageRules, I want to paste a real package file and
pick from the dependencies Renovate actually extracts, so that my pins and
simulations run against the names and values production Renovate would use —
not my guess at them.

## Scope

- **Shims** — two new suffix-matched entries in
  `vite-plugin-renovate-shims.ts`:
  - `util/fs/index.js` → an in-memory `{ path → content }` store (the single
    fs door every manager uses; also sidesteps the `localDir` throw and the
    path-escape guard);
  - `util/http/got.js` / `util/http/index.js` → stub (managers import
    datasource classes for their `.id`, which drags the Node `got` stack at
    module scope; the existing shim only covers the datasource aggregate).
- **Engine** — `extract.ts` beside `simulate-package-rules.ts`:
  - `matchManagersForFile(fileName)` from
    `manager-default-configs.generated.js` (already bundled, zero imports) +
    upstream `getMatchingFiles` — the same cheap path-only step 063 uses;
  - `extractDeps(manager, fileName, content)` over a **curated** lazy map of
    per-manager deep imports (`renovate/dist/modules/manager/<name>/extract.js`),
    replicating upstream's 4-line `massageDepNames` post-step and resetting the
    memory cache between runs (github-actions memoizes a lockfile-read promise
    under a fixed key);
  - launch set = the ecosystems the quick-fill chips already advertise, plus
    the pure easy wins: `npm` (via its internal single-file
    `extractPackageFile` — skipping `postExtract`'s lockfile sweep), `maven`
    (via the pure `extractPackage`), `dockerfile`, `github-actions`, `gomod`,
    `pip_requirements`, `pep621`, `helm-values`, `cargo`, `nuget`, and the
    custom managers 063 already runs;
  - new deep imports go through `renovate-adapter.ts` like everything else.
- **App** — proposals on the **Tests tab**: extracted deps listed per file
  (name, currentValue, datasource, depType), each with _Pin as test_ (the
  `TestsPanel.openPin` channel) and _Open in simulator_ (the `SimRequest`
  channel). The `PackageDependency → FormState` mapping is near-mechanical:
  depName, packageName, currentValue, datasource, depType, versioning,
  registryUrls, plus the file's path as `packageFile` and the matched manager
  as `manager`.
- **Input** — 063's `{ path, content }` file set in `ConfigColumn`, unchanged.
  This item adds consumers, not a second input surface.
- **CLI** — `extractDeps` lands on `engine-surface.ts` for free; an
  `rcd extract <file>` subcommand makes the pasted-file question answerable
  headlessly and gives the drift suite a natural fixture runner.

## Decisions

- **Curated manager set, not all 129.** Every manager in the map is permanent
  maintenance surface on Renovate bumps (extract joins the config pipeline
  under the "not a public API" pin). The map grows by demand, one entry + one
  golden/shimmed fixture pair at a time; an unmapped manager reports an honest
  "not supported in the browser" — the conda precedent.
- **Deep imports per manager, never the barrel.** `modules/manager/api.js`
  statically imports every manager (2.8 MB + WASM + `got` + `@yarnpkg/core`,
  and no `sideEffects` flag to shake it). Each mapped manager is its own lazy
  chunk behind the existing dynamic-import conventions.
- **Proposals fill `currentValue`; `newValue` stays the user's.** Extraction
  reads the file; it does not know what the next version is — that would need
  live datasource lookups, which the engine deliberately severs. The form's
  existing `deriveUpdateType` flow takes over once the user types the target.
- **Single-file semantics, stated honestly.** The 12 multi-file-only managers
  (gradle, sbt, the workspace/lockfile paths of npm…) either use their
  internal single-file function (npm, maven) or are out of the map. Cargo's
  sibling reads (`Cargo.lock`, `.cargo/config.toml`) resolve against the
  in-memory store — present if the user pasted them, gracefully absent
  otherwise. No pretending a pasted file is a repository.
- **Extraction is on demand per file** — 063's cost decision (§4.2 of its
  feasibility note) applies unchanged, and results are memoized per
  `(content, manager)`. Nothing lands on the typing path the `render` project
  protects.

## Not in scope

- **`newValue` / "latest version" proposals** — needs datasource network
  calls; a different feature with a different trust story.
- **Multi-file experiences**: npm workspaces, lockfile-aware extraction,
  gradle, maven parent-POM chains. The fs shim's store makes a virtual
  multi-file FS possible later; this item must not foreclose it, and does not
  build it.
- **terraform** (`@cdktf/hcl2json` Go-WASM eager import), the npm **yarn**
  path (`@yarnpkg/core`), anything touching `artifacts.js`.
- RE2-fidelity messaging — stays 064's, unchanged by this item (built-in
  managers' regexes are upstream-authored; the concern is custom input only).

## Verification

- Engine: a golden/shimmed fixture pair **per mapped manager** holding the
  byte-identity invariant — real package files in, identical
  `PackageDependency[]` out in both module regimes. These double as the drift
  net for Renovate bump PRs.
- Shims: a shimmed-project test that the fs store round-trips
  `readLocalFile`/`getSiblingFileName`/`findLocalSiblingOrParent`, and that a
  second extraction after reset does not see the first run's memoized
  github-actions lockfile read.
- App: unit tests for the `PackageDependency → FormState` mapping (including
  `packageName`-only deps after `massageDepNames`); a `render`-project test
  that typing never triggers extraction.
- e2e: paste a `package.json`, see its dependencies proposed, pin one, watch
  the pin evaluate against the loaded config; open another in the simulator
  and find the form pre-filled.
