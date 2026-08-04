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

It ships in three releases, and the **first one changes nothing**: upstream
0.8.1 under a new name, so switching to the fork is a specifier rename with no
behavior to evaluate and nothing to trust yet. The fixes arrive after that, one
release per class of change, each independently adoptable and revertible.

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
1.95 ms), and a schema payload at editor mount of 82 kB gz instead of 172 —
total JS 3,294 → 2,955 kB, with every other engine chunk md5-identical
(measured in `525a96f`, 2026-07-27; 031's "~160 kB gz schema layer" is the
figure from *before* these cuts).

## Scope

- A GitHub fork of `acao/codemirror-json-schema` at the 0.8.1 tag, with the
  five changes applied to `src/features/*.ts` and `src/utils/`, upstream's
  test suite kept green.
- Published under the project's npm scope with provenance, same pipeline
  shape as 056 — in three releases (below), starting with a verbatim mirror.
- This repository migrates onto it in three matching steps: the patch,
  `patchedDependencies`, `codemirrorJsonSchemaShims()` and
  `src/platform/shims/*` all disappear, but not all at once.
- An upstream-tracking arrangement so the fork can die when upstream revives.

## Release sequence

| Release | Contents | What a consumer sees |
| --- | --- | --- |
| **0.8.1** | upstream `v0.8.1` verbatim, renamed | nothing — a specifier rename |
| **0.9.0** | + the three `Draft0x` memoizations | 242.3 ms → 1.9 ms per completion; no API change, no visible change |
| **0.10.0** | + markdown-it rendering, YAML parser off the default path | no API change; tooltip code fences lose syntax colours |

There is no `1.0.0` on this roadmap. The fork stays in `0.x` for as long as
it exists — see the versioning decision below.

**None of the three releases breaks the public API**, which is worth stating
because the app's local versions of these changes would. The library's main
entry exports the three extensions, `jsonSchema`, the JSON parser, the
pointer utils and the state module — `getDefaultParser` is **not** among
them (features import it internally from `../parsers`), and
`parseYAMLDocumentState` is exported from the `/yaml` entry, not from `.`.
`renderMarkdown` is likewise internal to `utils/`. So both bundle changes are
internal rewiring plus one cosmetic delta; `0.10.0` gets its own minor
because the tooltip change is visible, not because anything is removed.

### What "identical" means for 0.8.1, and how it's proven

The mirror is only worth publishing if the claim is checkable. The release job
builds the fork at the upstream tag, then diffs its tarball against
`codemirror-json-schema@0.8.1`'s published tarball file by file. The only
permitted differences are the package's identity: `name`, `repository`,
`homepage`, `bugs`, and the added `publishConfig`/provenance metadata.
Everything else — `version`, `exports` and every subpath (`/json5`, `/yaml`,
`…`), `peerDependencies` ranges, `dependencies`, and each emitted file under
`dist/` and `cjs/` — must match byte for byte.

If upstream's published artifact turns out not to be reproducible from its own
tag (build-tool version drift, embedded paths), the honest options are to
republish upstream's tarball contents with only the identity fields rewritten,
or to build from source and record the exact diff in the release notes. What
is not acceptable is shipping "basically the same" under a version number that
promises otherwise. Establishing which case we're in is the first task of this
item, because it decides how the mirror is built.

Keeping the peer ranges identical also matters mechanically: the app already
depends on `@codemirror/language`, `@codemirror/view` and friends directly, and
a widened or narrowed peer range would change how pnpm dedupes them — which
would make the "no-op" switch quietly not one.

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

- **The YAML change routes around the parser; it does not stub it.** This is
  the one place where the fork must be more careful than the shim it
  replaces. `getDefaultParser` is a runtime `switch` over all three parsers,
  statically importing each — which is why importing the main entry drags
  `yaml` in even though the mode is fixed by *which entry you imported*. The
  app's shim can make `yaml-parser.js` throw because the app never uses YAML
  mode; a library cannot, because `codemirror-json-schema/yaml` must keep
  working. The fork's fix is for each entry to supply its own parser instead
  of asking a barrel to pick one — same exported symbols, same behavior per
  entry, and the static edge from `.` to `yaml` simply doesn't exist. It is
  also the version of the change that upstream could actually merge.

- **`filter: false` is still left alone.** Upstream re-invokes the completion
  source on every keystroke instead of filtering a cached list. At ~2 ms per
  query that is cheap, and `validFor` is incompatible with the library's own
  manual filtering — the same call made in `patches/README.md`, carried
  forward unchanged.

- **Mirror first at upstream's own version number, then diverge.** The first
  release is `0.8.1` — the same version string as the upstream release it
  copies, because that is the one number that says exactly what it is. It buys
  something a diverged first release cannot: adopting the fork and adopting
  the changes become two separate decisions, for us and for anyone else. If
  the editor misbehaves after the switch, the fork is not a suspect.
  Divergence starts at `0.9.0`, which leaves upstream's `0.8.x` line free —
  a future upstream `0.8.2` then can't be confused for one of ours. From
  `0.9.0` on the package versions itself, and its README carries the
  fork-point commit plus every upstream release merged since (the same
  compat-table pattern as 056).

- **Stay in `0.x`; there is no `1.0.0`.** The fork is expected to iterate
  fast and to be short-lived — a `1.0.0` would promise a stability we have no
  intention of offering while upstream's own shape is still moving underneath
  us, and it would make every later change of consequence a major bump we'd
  have to justify. In `0.x` the minor carries anything notable, breaking or
  not (the same scheme 056 uses for the engine), and npm's defaults back that
  up: `^0.9.0` does not match `0.10.0`, so nothing arrives without a
  deliberate bump — useful here not because `0.10.0` breaks anything, but
  because it is the release with a visible change in it. If the fork ever
  outlives its purpose enough to deserve a stable major, that is a decision
  made then, on evidence, not scheduled here.

- **One release per class of change.** The memoizations (`0.9.0`) are
  invisible and measurable; the bundle changes (`0.10.0`) are visible and
  measurable in a different unit. Bundling them would force a consumer to
  accept unhighlighted tooltips in order to get the 240 ms back, and would
  leave us unable to tell which change moved a number when one of them
  regresses.

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

Three steps, one per release, each landing on its own and each revertible by
reverting one commit.

**Step 1 — the no-op switch (onto `0.8.1`).** Nothing but names change; the
patch and both shims stay exactly where they are and keep doing exactly what
they do.

- `packages/app/package.json` — swap the specifier.
- `pnpm-workspace.yaml` — the `patchedDependencies` key becomes
  `@renovate-config-debugger/codemirror-json-schema@0.8.1`, and the patch file
  is renamed to match pnpm's convention. Its **contents don't change** — it
  patches the same `dist`/`cjs` bytes, which is a second, incidental proof
  that the mirror is identical: a patch that no longer applies cleanly means
  it isn't.
- `packages/app/vite.config.ts` — the shim plugin's `require.resolve` and its
  two path suffixes carry the package name; both must move.
- `packages/app/src/platform/editor-schema.ts` — the static import and the
  lazy `import("…/json5")`.
- `.oxlintrc.json` — four `no-restricted-imports` rules name the package by
  specifier to keep the schema stack behind `platform/editor-schema.ts`
  (031). All four must name the new package, or the guard silently stops
  guarding. Their message still quotes 031's pre-shim "~160 kB gz"; worth
  refreshing to the current 82 while touching all four anyway.
- Prose references to the package name (`keystroke-render.test.tsx`'s comment
  on why no hover mock is needed, `patches/README.md`, `AGENTS.md`). No test
  or script matches on the specifier, so nothing here can fail silently.

The step is correct exactly when the full suite — unit, render, e2e — passes
with no other edits and no numbers moving. That is the whole point of it.

**Step 2 — drop the patch (onto `0.9.0`).** Delete
`patches/…codemirror-json-schema@0.8.1.patch`, its `patchedDependencies`
entry and its `patches/README.md` section. Guarded by 032's keystroke-render
test: the per-completion number must match the patched baseline, because the
fix is the same fix.

**Step 3 — drop the shims (onto `0.10.0`).** Delete
`codemirrorJsonSchemaShims()` from `vite.config.ts` along with its ~40 lines
of rationale comment, and `src/platform/shims/codemirror-json-schema-*.ts`.
Update `editor-schema.ts`'s comments that reason about upstream's `bundled.js`
layout, which the fork now owns, and the sentence in `AGENTS.md` /
`docs/Architecture.md` that cites this plugin as the app's copy of the
engine's shim mechanism — it loses its example. Guarded by the schema chunk's
size, which must not grow.

## Risks

- **A fork is a maintenance commitment.** Security fixes and
  `json-schema-library` drift become ours to track for as long as it lives.
  Mitigated by keeping the diff small, upstream-shaped and filed — and by the
  fork being the thing that lets us stop patching `dist` blind.
- **One bundle change is visible.** Tooltip code fences lose syntax colours —
  already the accepted delta in this app, but a change a different consumer
  might care about, which is why it lands alone in `0.10.0` with the delta at
  the top of the README rather than riding along with the perf fixes. The
  YAML rerouting is invisible if done right; if it can't be done without
  changing an exported symbol, that is the signal to stop and rethink the
  approach, not to relabel the release.
- **A mirror release can be misread as an endorsement to switch.** `0.8.1`
  under our name is upstream's code, published by us, and someone finding it
  may assume it's maintained beyond the five changes we care about. The
  package README's first paragraph says what it is, what it will diverge into,
  and that the intent is for it to become unnecessary.

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

Per release, since each is adopted on its own:

**0.8.1 (mirror).** The tarball diff against upstream's published artifact,
described above — identity fields only. Upstream's own suite green on the
fork as published (0.8.1's baseline is 50/50 completion tests and a clean
`tsc`; the 7 `lang-yaml` failures on that checkout are pre-existing drift and
stay documented as such). In this repository, step 1's rename must leave the
existing patch applying cleanly and every suite — `test:unit`, the `render`
project, e2e — passing with **no other change**; a number that moves here
means the mirror isn't one.

**0.9.0 (perf).** New tests in the fork asserting a single `Draft0x`
construction across repeated calls — what the patch has never been able to
prove, and the reason to move the fix into source. In this repository, 032's
keystroke test must match the patched baseline (~1.9 ms per completion), not
merely beat the unpatched one.

**0.10.0 (bundle).** The schema payload at editor mount must still be 82 kB gz,
not 172, once the shim plugin is deleted — the fork now has to be doing what
the plugin did, and `525a96f`'s measurement is the baseline to reproduce. The e2e suite is what actually exercises
hover, completion and validation in a real browser, and is where an
over-aggressive markdown or parser change would surface.

Throughout: `pnpm lint` (the restricted-import rules must resolve against the
new specifier — a rule naming a package that is no longer installed enforces
nothing), `pnpm typecheck`, `pnpm format:check`.
