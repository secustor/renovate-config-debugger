# 057 — Fork `codemirror-json-schema` as `@renovate-config-debugger/codemirror-json-schema`

Milestone: M15 · Status: proposed

## Summary

The editor's schema intelligence — completion, hover docs (003), validation —
comes from `codemirror-json-schema@0.8.1`. The app does not use it as shipped.
It carries a **pnpm patch against the published `dist`/`cjs` output** for three
performance defects, and a **Vite `resolveId` plugin** that swaps two of the
library's modules out of the bundle. Both are local stand-ins for changes that
belong upstream, and upstream (`acao/codemirror-json-schema`) has merged
nothing since 2025-04-21 with several PRs open.

That arrangement has a floor on how good it can get: a patch against build
output re-breaks on every bump, is invisible to TypeScript, cannot be tested,
and cannot be shared. This item forks the library, applies the same five
changes **at the source**, and publishes the result as
`@renovate-config-debugger/codemirror-json-schema` — deleting the patch, the
shim plugin and the two shim modules from this repository.

## User story

As a maintainer, I want the library the editor depends on to already contain
the fixes it needs, so that a version bump is a version bump instead of a
patch-refresh and a re-measurement.

## What is carried locally today

| Fix | Where it lives now | Why |
| --- | --- | --- |
| `Draft07` memoized on schema identity (completion) | `patches/…@0.8.1.patch` | `new Draft07(schema)` pre-processes 258 kB of Renovate schema (~123 ms) and upstream builds a fresh one at every call site, up to 6× per keystroke |
| `this.originalSchema = schemaFromState` assignment | same patch | upstream compares the field but never assigns it, so the whole change-detection block (including `makeSchemaLax` over the full schema) ran on every call |
| `Draft04` memoized (hover, validation) | same patch | ~69 ms rebuilt on every hover and every `doValidation` |
| `utils/markdown.js` → markdown-it only | `packages/app/vite.config.ts` shim | upstream's module runs a top-level async IIFE building a shiki highlighter (~330 kB raw) purely to colour code fences in tooltips, statically imported by three features |
| `parsers/yaml-parser.js` → throw | same shim | the parsers barrel statically imports the YAML parser, dragging `yaml` into the schema chunk for an app that never uses YAML mode |

Together: 242.3 ms → 1.9 ms per completion (measured on the `{ "ran| }`
fixture against the Renovate schema; verified end-to-end in the app at
1.95 ms), and the two bundle cuts that keep 031's lazy schema chunk at
~160 kB gz.

## Scope

- A GitHub fork of `acao/codemirror-json-schema` at the 0.8.1 tag, with the
  five changes applied to `src/features/*.ts` and `src/utils/`, upstream's
  test suite kept green.
- Published under the project's npm scope with provenance, same pipeline
  shape as 056.
- This repository migrates onto it: the patch, `patchedDependencies`,
  `codemirrorJsonSchemaShims()` and `src/platform/shims/*` all disappear.
- An upstream-tracking arrangement so the fork can die when upstream revives.

## Decisions

- **A real GitHub fork, not a vendored package in this workspace.** The point
  of this fork is to be temporary: every change in it is meant to be filed
  upstream, and `git diff upstream/main` is the artifact that says how far
  we've drifted and what still needs filing. Copying the sources into
  `packages/` throws that away and quietly converts a rebase into a rewrite.
  It also keeps an MIT-licensed library out of an AGPL-3.0 repository, where
  contributing changes back would raise a licensing question that does not
  need to exist.

- **Fix at source, publish source-built artifacts.** The current patch edits
  four generated files (`dist/` and `cjs/` copies of the same three modules)
  because that is all a published tarball exposes. In the fork the same fix is
  three edits in TypeScript, type-checked, and covered by upstream's own
  tests.

- **The two bundle shims become library behavior, not consumer workarounds.**
  Both are defects for every consumer, not just this app: no one wants an
  unconditional shiki highlighter in a tooltip path, and a parsers barrel that
  statically imports YAML defeats the library's own `/yaml` entry point. In
  the fork, markdown rendering drops to `markdown-it` with syntax highlighting
  made opt-in (a consumer that wants shiki passes it in), and the YAML parser
  moves behind the `/yaml` entry so the barrel stops reaching it. That deletes
  ~330 kB from every consumer's graph and removes the app's shim plugin
  entirely.

- **`filter: false` is still left alone.** Upstream re-invokes the completion
  source on every keystroke instead of filtering a cached list. At ~2 ms per
  query that is cheap, and `validFor` is incompatible with the library's own
  manual filtering — the same call made in `patches/README.md`, carried
  forward unchanged.

- **Independent versioning from `1.0.0`, with a fork-point table.** Mirroring
  upstream's version numbers invites a collision the first time upstream
  releases `0.8.2`, and a `-rcd.N` prerelease suffix sorts *below* the version
  it is built on. The package versions itself, and the README states the
  upstream commit it was forked from and every upstream release merged since —
  the same compat-table pattern as 056.

- **Every change is filed upstream, and the fork's README says so.** If a PR
  merges and a release ships, the exit is: drop the dependency, go back to
  `codemirror-json-schema`, delete the fork. To notice that moment, the fork
  keeps upstream pinned as a devDependency so this project's own Renovate bot
  opens a PR on every upstream release — the rebase signal arrives by the same
  mechanism as every other dependency here.

- **MIT stays MIT.** Upstream's license, copyright and attribution are kept
  verbatim; a NOTICE records what diverged. The published package is MIT even
  though the app consuming it is AGPL.

## Migration in this repository

- `packages/app/package.json` — swap the dependency.
- `pnpm-workspace.yaml` — drop the `patchedDependencies` entry;
  `patches/codemirror-json-schema@0.8.1.patch` and its `patches/README.md`
  section go with it.
- `packages/app/vite.config.ts` — delete `codemirrorJsonSchemaShims()` and its
  ~40 lines of rationale comment; `src/platform/shims/codemirror-json-schema-*.ts`
  are deleted.
- `packages/app/src/platform/editor-schema.ts` — update the import specifiers
  (including the lazy `import("codemirror-json-schema/json5")`) and the
  comments that reason about upstream's `bundled.js` layout, which the fork
  now owns.
- `.oxlintrc.json` — four `no-restricted-imports` rules name the package by
  specifier to keep the ~160 kB gz schema stack behind
  `platform/editor-schema.ts` (031). All four must name the new package, or
  the guard silently stops guarding.
- Root `README.md` / `docs/Architecture.md` — the shim-system section
  currently cites the codemirror-json-schema plugin as the app's copy of the
  engine's mechanism; that sentence loses its example.

## Risks

- **A fork is a maintenance commitment.** Security fixes and
  `json-schema-library` drift become ours to track for as long as it lives.
  Mitigated by keeping the diff small, upstream-shaped and filed — and by the
  fork being the thing that lets us stop patching `dist` blind.
- **The bundle changes alter behavior**, not just size: tooltip code fences
  lose syntax colours (already the accepted delta today), and a consumer
  importing the parsers barrel expecting YAML gets an error instead. Both are
  breaking for hypothetical other consumers, which is why the fork starts at
  its own `1.0.0` with the deltas listed at the top of its README.

## Out of scope

- Rewriting the library's completion architecture, or moving it off
  `json-schema-library` v9.
- Taking over maintenance of upstream (adopting the package, publishing under
  its original name, or asking for commit rights). If that conversation
  happens it replaces this item rather than extending it.
- The `codemirror-json5` dependency, which is unpatched and unforked.

## Dependencies

- The `@renovate-config-debugger` npm organization (shared prerequisite with
  056 — whichever lands first creates it) and the publish workflow shape
  established there.
- 031 (the chunk budget the bundle fixes exist to protect) and 032 (the
  keystroke-render regression test that measured the patch in the first
  place).

## Verification

- Upstream's own suite green on the fork (0.8.1's baseline is 50/50 completion
  tests and a clean `tsc`; the 7 `lang-yaml` failures on that checkout are
  pre-existing drift and stay documented as such), plus new tests for each of
  the five changes — the memoization ones assert a single `Draft0x`
  construction across repeated calls, which is what the patch has never been
  able to prove.
- In this repository, after migration: the `render` project's keystroke test
  (032) must show no regression against the patched baseline, and the schema
  chunk must not grow — the two numbers this whole arrangement exists to hold.
- `pnpm lint` (the restricted-import rules resolve against the new
  specifier), `pnpm typecheck`, `test:unit`, and the e2e suite, which is what
  actually exercises hover, completion and validation in a real browser.
