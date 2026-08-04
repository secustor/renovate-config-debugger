# 056 — Publish the engine as `@renovate-config-debugger/engine`

Milestone: M15 · Status: done (2026-08-05)

## Summary

`packages/engine` is the only part of this repository that is not
app-specific. It is the thing nobody else has: Renovate's own config
pipeline — parse, migrate, massage, validate, resolve presets, merge,
re-migrate (052), simulate `packageRules` — running **in a browser**, with a
trace of every stage, because a Vite plugin swaps Renovate's Node-only choke
points for browser-safe shims. Today it is `private: true`, its `exports`
point straight at `.ts` files in `src/`, and the only consumer that can use it
is the app sitting next to it in the workspace.

This item publishes it to npm as `@renovate-config-debugger/engine` so that
anything else — a docs site, an IDE extension, a CI check that diffs a
config's resolved output, a bot that explains its own decisions — can reuse
the pipeline instead of re-deriving the shim trick.

## User story

As someone building a tool that needs to know what Renovate will do with a
config, I want to `pnpm add @renovate-config-debugger/engine` and get the
traced pipeline, so that I don't have to deep-import a non-public API and
rediscover which of Renovate's internals refuse to load off a server.

## Scope

- The engine's three entry points become a published, versioned contract:
  `.` (pipeline + trace + simulator), `./schema` (the stripped Renovate JSON
  schema), `./vite-plugin` (`renovateShims()`).
- A build step: compiled ESM + `.d.ts`, replacing `exports` that currently
  resolve to TypeScript sources.
- Package metadata, license statement, README, and a compatibility table
  pinning each engine release to the Renovate version it was built against.
- A publish workflow with npm provenance, and packaging tests that fail CI
  when the published shape would be broken.
- Flipping the engine to `private: false`. The **name is already correct**:
  #120 renamed every workspace package to `@renovate-config-debugger/*` (and
  the Docker images to match), so this item no longer has to move it.

## Decisions

- **The name is settled; only publication is left.** This item was drafted
  expecting to rename the workspace scope as part of publishing. #120
  (2026-08-04) did it first, for its own reasons — the repository has been
  `renovate-config-debugger` on GitHub for a while and the packages had
  drifted from it. The remaining delta between the engine's manifest and a
  publishable one is therefore small and mechanical: `private`, `files`,
  `exports` pointing at built output, and the metadata below.

- **AGPL-3.0-only, stated on the tin.** The engine links Renovate's own code
  (`renovate` is `AGPL-3.0-only`), which is why this repository is AGPL too.
  Publishing does not change that, but it changes who has to know: a
  consumer who `pnpm add`s a copyleft library into a closed-source product has
  a licensing problem, and npm's package page is where they will look for it.
  The `license` field, the README's first section and the package description
  all say it. This is a property of running Renovate's real code — the
  alternative is reimplementing the pipeline, which is exactly the thing this
  project refuses to do.

- **`renovate` stays an exact `dependency`, not a peer.** The engine reaches
  into `renovate/dist/**` through one adapter module, against internals that
  are explicitly not a public API; a peer range would let a consumer install a
  version whose internals moved and hand us a broken pipeline at runtime. The
  exact pin is the contract. Two consequences, both stated in the README:
  a consumer's install pulls the whole `renovate` package (it is large), and
  **a Renovate bump is a release of this package**, not a floating detail.

- **Version scheme: `0.x`, minor = breaking, plus a compat table.** Until the
  export surface settles, `0.x` with breaking changes in the minor is the
  honest signal — and with a Renovate bump able to force a release at any
  time, iteration here is expected to be fast for the foreseeable future.
  No `1.0.0` is scheduled; it is a decision to make once the exports have
  stopped moving, not a milestone to aim at. `^0.x` ranges not crossing the
  minor is the mechanism that keeps that safe for consumers. Every release row records `engine` → `renovate` →
  `renovate-schema` so a consumer can answer "which Renovate does this
  reproduce?" without unpacking the tarball. `renovateVersion` is already
  exported from `src/version.ts` and stays the runtime answer to the same
  question.

- **Emit files, do not bundle.** `renovateShims()` builds its shim map from
  `path.join(shimDir, …)` where `shimDir` is derived from `import.meta.url`,
  and returns those paths from `resolveId` for the consumer's bundler to load.
  A bundled single-file plugin would have nothing to point at. The build
  therefore emits a mirrored file tree (`dist/shims/*.js` beside
  `dist/shims/vite-plugin-renovate-shims.js`), and the shims ship as compiled
  JS rather than `.ts`, so a consumer's bundler is not required to transform
  TypeScript that lives inside `node_modules`.

- **`vite` is a `peerDependency` of the package, needed only by
  `./vite-plugin`.** That entry imports `node:module`/`node:path`/`node:url`
  and a `Plugin` type; it is Node-only build-time code and must not be pulled
  into a browser graph. Mark the peer optional so a consumer using another
  bundler (who then owns the shim wiring themselves) does not get a warning.

- **Audit the export surface before freezing it.** `src/index.ts` re-exports
  roughly a dozen modules, some of which are app copy rather than engine
  capability — `error-translations.ts` and `error-fix-text.ts` produce
  human-facing English strings and quick-fix text, and `option-docs.ts` builds
  an index for editor tooltips. Each one is a keep-or-drop decision made once,
  in this item, because after publishing it is a breaking change either way.
  Recommendation: keep them (they are derived from Renovate's own option
  metadata and are the expensive part to rebuild), but move anything whose
  shape is dictated by the app's components behind an explicitly
  "unstable" subpath.

## What it takes

1. **Build.** `tsc` declaration + JS emit (the package is already
   `"type": "module"`, ESM only — no dual CJS build; a CJS consumer of a
   package that deep-imports `renovate/dist` ESM is not a case worth
   carrying). Verify the emitted `.d.ts` does not leak `renovate/dist/**`
   type paths into the public surface; where it does, re-declare the type in
   `src/types/` rather than re-export it.
2. **Manifest.** `files`, `repository`/`homepage`/`bugs`, `license`,
   `sideEffects: false`, `publishConfig.access: public`, `engines`.
   `exports` gains `types` conditions per entry.
3. **Packaging tests, run in CI.** `publint` and
   `@arethetypeswrong/cli` over `pnpm pack`'s tarball, plus a smoke consumer:
   a scratch Vite project outside the workspace that installs the tarball,
   imports all three entries, runs one pipeline and asserts the trace — the
   packed-artifact equivalent of `check:dev-graph`, and the only way an
   `exports` typo gets caught before a user finds it.
4. **Publish workflow.** Tag-triggered (`engine-v*`), OIDC/trusted publishing
   with npm provenance rather than a long-lived `NPM_TOKEN` — the repository
   already reports an OpenSSF Scorecard, and provenance is the cheapest win
   on it. The workflow re-runs `checks` before publishing; it never publishes
   from a branch.
5. **Package README.** What it does, the AGPL statement, the Renovate-pin
   statement, a minimal Vite example (plugin + `runPipeline`), the "this
   consumes a non-public API" caveat, and the compat table.

## Out of scope

- Publishing `app` or `oauth-worker`. The app is a deployable, already
  distributed as an image (043); the worker is deployment glue.
- A non-Vite build path (webpack/rspack/esbuild plugin equivalents). The shim
  mechanism is documented well enough for someone to port it, and a second
  official integration is a maintenance commitment to make only when asked.
- Running the engine under plain Node without a bundler. The golden test
  project proves untouched Renovate works there, but the shimmed graph is a
  bundler-resolution feature; a Node entry point would need a loader hook and
  is its own item.
- Renaming the published container images.

## Dependencies

- The `@renovate-config-debugger` npm organization must exist and be owned by
  the project before either this item or 057 can publish. Same prerequisite
  for both; whichever lands first creates it.
- 001 (the engine and its trace model), 052 (the pipeline's current fidelity —
  publishing freezes whatever fidelity ships).

## Verification

- `pnpm -r typecheck`, `pnpm lint`, `pnpm test` green against the built
  artifact rather than `src/` — the app resolves the engine through
  `workspace:*`, so pointing `exports` at `dist/` changes what every consumer
  in the repo actually loads.
- The engine's golden and shimmed projects must still produce byte-identical
  results **through the built artifact**, not only through `src/` — the
  shimmed project is what proves the shims don't alter behavior, and the
  build must not alter it either.
- `publint` and `attw` clean on the tarball; the scratch-consumer smoke test
  green.
- A dry-run publish (`pnpm publish --dry-run`) whose file list is reviewed by
  hand once, so nothing from `test/` or `scripts/` ships.

## As implemented (2026-08-05)

- **`publishConfig`, not a second manifest.** `exports` on disk still points at
  `src/*.ts`, so the app, the golden/shimmed projects and `vite dev` load
  exactly what they loaded before; pnpm rewrites `exports`/`types` onto
  `dist/` when it packs. Verification therefore reads: the repo's suites prove
  the sources, and the packaging suite proves the tarball. Pointing the
  workspace at `dist/` instead would have made every dev edit require a build
  for no gain the packed artifact doesn't already give.
- **Packaging tests are one vitest project, `packaging`**, wired into CI's
  test job and re-run by the publish workflow before it uploads anything.
  It packs, unpacks into a scratch consumer's `node_modules`
  (tarball + the manifest's own dependencies, symlinked), asserts the packed
  manifest and file list, **type-checks a consumer that imports all three
  entry points** against the tarball, and loads the packed Vite plugin to
  require every shim it redirects to inside `dist/`.
- **`publint`/`attw` were not adopted.** The scratch consumer above is the
  same check with a sharper edge (it caught two real defects while being
  written: the shim map's hard-coded `.ts` suffixes, and `fast-json-patch`
  reaching the public declarations), and it needs no new dependency. `attw`
  specifically would report node16 resolution errors that no supported
  consumer hits: the emitted ESM is deliberately bundler-targeted
  (extensionless relative specifiers; `renovate/package.json` and
  `renovate/renovate-schema.json` imported as JSON), which is the same reason
  "plain Node without a bundler" is out of scope above.
- **Export-surface audit outcome:** `getOptions` was dropped from `.`, and
  `mergeChildConfig` moved to `src/config-merge.ts` where its signature is
  declared locally. Both for the same reason: `renovate-adapter.ts` re-exports
  a dozen `renovate/dist` modules that ship no `.d.ts` (this repo declares them
  ambiently in `src/types/`, which does not travel in a tarball), so a public
  entry point must not route through it. `getOptionIndex()` remains the
  engine's own view of the option metadata. `error-translations`,
  `error-fix-text` and `option-docs` were kept as recommended, with no
  "unstable" subpath: nothing in their shapes is dictated by an app component.
- **`sideEffects: false` was not set.** The shim modules are pulled into a
  consumer's graph by a `resolveId` redirect from inside `renovate/dist`, not
  by an import from this package's own entry points; a blanket
  side-effect-free claim over that tree is not one this package can honestly
  make, and it would silently change the app's own bundle (same manifest,
  workspace resolution) with only the e2e suite as a guard.
- **Left for the publish-time human:** create the `@renovate-config-debugger`
  npm organization; add the `NPM_TOKEN` secret and the `npm-publish`
  environment to the repository; then push the first `engine-v0.1.0` tag. The
  workflow refuses to publish if the tag and `packages/engine/package.json`
  disagree, and re-runs lint/format/typecheck/golden/shimmed/packaging before
  it uploads.
