# Built-in manager extraction — feasibility survey (2026-08-21)

Prompted by the question "how much effort to run Renovate's extract mechanism,
so the Tests and Simulator tabs can propose dependencies instead of having them
hand-typed?". The custom-manager spike
([2026-08-custom-manager-simulation-feasibility.md](2026-08-custom-manager-simulation-feasibility.md))
deliberately excluded built-in managers — "the whole manager registry and a
very different bundle conversation" (063, Not in scope). This note is that
conversation: two survey agents read the pinned `renovate@44.30.0` dist and the
app's dependency-input surface. Verdict: **feasible, medium effort — two new
shims, one engine module, one UI slice.** Roadmap item:
[078](078-dep-proposals-from-extraction.md).

## 1. The API surface

`dist/modules/manager/index.js` exposes
`extractPackageFile(manager, content, fileName, config)` returning
`PackageFileContent | null`, whose `.deps` is `PackageDependency[]` — `depName`,
`packageName`, `currentValue`, `currentDigest`, `datasource`, `depType`,
`versioning`, `registryUrls`, `skipReason`, `replaceString`, … That maps almost
1:1 onto the simulator's `FormState` / the engine's `DependencyDescriptor`.
The barrel also falls back to the custom-manager api, so
`extractPackageFile("regex", …)` works through the same call.

`ExtractConfig` is almost all optional (`registryAliases?`, `npmrc?`,
`repository?`, plus the custom-manager fields); `{}` suffices for the managers
below. The return is `MaybePromise` — 87 managers are sync, 21 async — so the
caller always awaits.

After extract, upstream applies one post-step worth replicating:
`massageDepNames` in `workers/repository/extract/manager-files.js` copies
`packageName` → `depName` when `depName` is unset. Four lines.

## 2. Manager purity (surveyed sample)

Of 129 managers, 111 expose `extractPackageFile`; 12 are
`extractAllPackageFiles`-only (`ant batect bun deno flux glasskube gitlabci
gradle maven npm pip-compile sbt`). 31 extract files import `util/fs`; **none
import `node:fs` or `node:child_process` directly** — every read goes through
`dist/util/fs/index.js`.

| manager              | extract entry                                                                                                                                             | fs                                                                                                     | notes                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| dockerfile           | `extractPackageFile`, sync                                                                                                                                | none                                                                                                   | pulls `data-files.generated.js` (76 KB) via distro versioning                            |
| github-actions       | `extractPackageFile`, async                                                                                                                               | one read                                                                                               | unconditional `readLocalFile(".github/actions-lock.json")`, memoized in the memory cache |
| gomod                | `extractPackageFile`, sync                                                                                                                                | none                                                                                                   | pure line parser                                                                         |
| pip_requirements     | `extractPackageFile`, sync                                                                                                                                | none                                                                                                   | `@renovatebot/pep440` (pure JS)                                                          |
| helm-values          | `extractPackageFile`, sync                                                                                                                                | none                                                                                                   | reuses dockerfile's `getDep`                                                             |
| cargo                | `extractPackageFile`, async                                                                                                                               | sibling reads                                                                                          | `.cargo/config.toml`, `Cargo.lock` — degrade gracefully when absent                      |
| nuget                | `extractPackageFile`                                                                                                                                      | some                                                                                                   | quick-fill chip ecosystem                                                                |
| npm                  | **api has only `extractAllPackageFiles`**, but `npm/extract/index.js` exports a real `extractPackageFile(content, packageFile, config)` — usable directly | heavy in `postExtract` (lockfiles, monorepo detection) — skipped when calling the single-file function | `@yarnpkg/core` only on the `yarn.js` path                                               |
| maven                | api multi-file only; `maven/extract.js` exports pure `extractPackage(rawContent, packageFile, config)`                                                    | parent-POM resolution only (skipped)                                                                   | `xmldoc`                                                                                 |
| gradle               | `extractAllPackageFiles` only                                                                                                                             | whole file list                                                                                        | `good-enough-parser` (pure JS) — no single-file path                                     |
| custom regex/jsonata | `extractPackageFile`, sync                                                                                                                                | none                                                                                                   | already proven by the 2026-08-05 spike                                                   |

Heavy/native landmines on specific paths: `terraform` eagerly imports
`@cdktf/hcl2json` (**Go WASM**), `terraform/lockfile` uses `yauzl` +
`node:crypto/stream/zlib`, npm's yarn path uses `@yarnpkg/core`, npm's pnpm
path and deno use `find-packages` (fs globbing). Everything else surveyed is
pure JS (`good-enough-parser` has no tree-sitter/native/WASM; verified).

## 3. Two new shims, and why

1. **`util/fs/index.js` → in-memory map.** The single fs choke point. Shimming
   it severs `fs-extra`, `find-up`, `node:stream`, `node:util`, and sidesteps
   the `readLocalFile → ensureLocalPath → upath.resolve(GlobalConfig.get("localDir"))`
   throw when `localDir` is unset (and the `FILE_ACCESS_VIOLATION_ERROR` on
   `../` escapes). `getLocalFiles` is a loop over `readLocalFile`, so one shim
   covers the whole surface.
2. **`util/http/got.js` (and `util/http/index.js`) → stub.** Nearly every
   extract file imports a datasource _class_ just to read its `.id`
   (`DockerDatasource.id` etc.), and `modules/datasource/datasource.js` imports
   `Http`/`RequestError` from the got-backed http stack at module scope. The
   existing `datasource-index.ts` shim only replaces the aggregate
   `modules/datasource/index.js`, not per-datasource modules, so without this
   stub any manager import drags `got` (Node-only) into the graph.

Already covered by existing shims/infrastructure: `logger/index.js` (the shim
exports `withMeta`, which github-actions needs), `expose.js` (re2 → native
`RegExp` fallback), `instrumentation`, `util/hash`, the package cache, the
`path` → `pathe` alias (makes `upath` work). `config/global.js` is the real
module and is browser-safe. `util/cache/memory` is pure — but it memoizes the
github-actions lockfile-read _promise_ under a fixed key, so it must be reset
between extractions.

## 4. Bundle: deep imports, never the barrel

`dist/modules/manager/api.js` statically imports all 129 manager `index.js`
barrels — 2.8 MB of manager source plus datasources, `util/exec`, `util/git`,
`@yarnpkg/core`, the terraform WASM — and renovate's package.json has **no
`sideEffects` field**, so tree-shaking drops none of it. This is the same trap
`config-scope.ts` already documents (it reimplements `removeGlobalConfig`
locally to avoid `dist/config/index.js` for exactly this reason).

The dist is rolldown-with-preserveModules and has no `exports` map, so
per-manager deep import works: `renovate/dist/modules/manager/<name>/extract.js`
exports `extractPackageFile` directly (npm via `npm/extract/index.js`, maven's
pure `extractPackage` via `maven/extract.js`, custom regex via
`modules/manager/custom/regex/index.js`). A static
`Record<manager, () => import(…)>` map gives a small lazy chunk per manager.

Filename → manager detection costs nothing extra:
`dist/manager-default-configs.generated.js` (every manager's
`managerFilePatterns`, zero imports) is already in the bundle transitively via
`loadManagerOptions()`, and `workers/repository/extract/file-match.js`
(`getMatchingFiles`) is browser-safe — only minimatch/regex/logger — and is
already the 063 path-matching entry point.

## 5. The app side (state as of 2026-08-21)

- A dependency enters the app exactly one way: the simulator form.
  `FormState` (`features/simulator/form.ts`) → `toDescriptor` →
  `engine.simulatePackageRules`. The Tests tab's pins are literally saved
  `FormState`s (`pins.ts`), evaluated by `use-pinned-tests.ts`, persisted only
  in the share link (`pins` field, cap 20).
- Two existing fill-from-outside channels: the `SimRequest` share-link path
  and `TestsPanel.openPin` — a proposals UI can reuse both instead of
  inventing a third.
- There is **no file-upload or paste affordance anywhere in the app** yet;
  063's `{ path, content }` file set in `ConfigColumn` is the planned input
  surface, and built-in extraction should ride it, not duplicate it.
- Engine loading conventions: dynamic `import()` only, single-flighted
  `loadEngine()`, `import type` for types, heavy leaves behind subpath exports
  (`./text-scan` precedent). Per-manager extract chunks fit this pattern; the
  CLI gets any new engine export for free through `engine-surface.ts`.

## 6. Landmines (verified, not assumed)

1. `got` via datasource-class imports — the http stub is mandatory, not
   optional (§3.2).
2. `localDir` throw / path-escape guard — sidestepped by the fs shim (§3.1).
3. The 12 multi-file managers have no `extractPackageFile` on their api;
   npm/maven have internal pure functions, gradle genuinely does not.
4. `MaybePromise` — always await.
5. re2 absent in the browser: `matchStrings` run on native `RegExp` — no ReDoS
   guard, and two-way accept/reject divergence. Already analyzed exhaustively
   in the custom-manager spike (§3 there) and owned by **064**; built-in
   managers' own regexes are upstream-authored and safe, so the concern is
   custom-manager input only.
6. github-actions' memory-cache memoization — reset between runs.
7. npm's `postExtract` reads every lockfile and does monorepo detection —
   expensive and fs-heavy; the single-file function skips it, which is the
   point.
8. `dist/config/index.js` re-drags the manager graph — keep using the
   generated lists (`manager-list.generated.js`,
   `manager-default-configs.generated.js`) as the metadata source.

## 7. Effort

Roughly **one week** for a shippable version, mirroring the custom-manager
estimate it extends:

- **Shims — ~1 day.** `util/fs` in-memory map (+ reset hook), http stub, both
  suffix-matched in `vite-plugin-renovate-shims.ts`; shimmed-project tests.
- **Engine — ~1–2 days.** `extract.ts`: manager map (curated set),
  `matchManagersForFile`, `extractDeps`, `massageDepNames`, memory-cache reset;
  golden/shimmed fixture pairs per manager (byte-identity), drift fixtures for
  Renovate bumps.
- **App — ~2–3 days.** Proposal list on the Tests tab fed from 063's file set;
  `PackageDependency` → `FormState` mapping; fill via the existing
  `openPin`/`SimRequest` channels.
- **Polish — ~1 day.** e2e, docs, copy for the honest-gap caveats.

The cost cliff is well-defined and excluded: multi-file experiences
(workspaces, lockfiles, gradle, parent POMs), terraform's WASM, and anything
needing datasource _lookups_ (extract yields `currentValue`; proposing a
`newValue` means network datasources — a different feature).
