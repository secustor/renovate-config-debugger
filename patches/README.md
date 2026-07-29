# Patched dependencies

Applied via pnpm's `patchedDependencies` (see `pnpm-workspace.yaml`). Every patch
here is a local stand-in for a change that belongs upstream — each entry records
what it does, why it is carried locally, and what would let us drop it.

## `codemirror-json-schema@0.8.1`

**What** — memoizes `new Draft07(schema)` on the schema object's identity, and
adds the `this.originalSchema = schemaFromState` assignment that upstream's
change-detection is missing.

**Why** — `new Draft07(schema)` pre-processes the whole schema. For Renovate's
schema (258 kB after `stripPercentKeys`, see `packages/engine/src/schema.ts`)
that is ~123 ms, and upstream constructs a fresh instance at every call site —
`getSchemas` and `getEffectiveObjectWithPropertiesSchema` — which `doComplete`
reaches up to six times per keystroke (it retries the whole completion against a
"lax" copy of the schema when the strict one yields nothing). Measured on the
`{ "ran| }` fixture against the Renovate schema:

|                | per completion |
| -------------- | -------------- |
| upstream 0.8.1 | 242.3 ms       |
| patched        | 1.9 ms         |

That 242 ms landed on the main thread on every keystroke, which is the editor
typing lag users reported. Verified end-to-end in the app at 1.95 ms.

The two edits are one fix: without the `originalSchema` assignment, `makeSchemaLax`
returns a fresh object on every call, so the lax schema would never hit the memo.

**Upstream** — the same change applies cleanly to `src/features/completion.ts`
and passes upstream's suite (50/50 completion tests, `tsc` clean; the 7 failures
on that checkout are pre-existing `lang-yaml` drift). It is not filed yet:
`acao/codemirror-json-schema` has merged nothing since 2025-04-21, with several
PRs open since. Drop this patch once a release carries the fix.

Upstream also constructs the completion result with `filter: false`, so
CodeMirror re-invokes the source on every keystroke rather than filtering a
cached list. That is left alone deliberately — at ~2 ms a re-query is cheap, and
`validFor` is incompatible with the library's own manual filtering.
