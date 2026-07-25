# 031 — Critical-path loading performance

Milestone: M9 · Status: done (2026-07-25)

## Summary

The 2026-07-25 best-practices review measured the production build and
attributed every byte: the initial JS load is **468 kB gzip**, of which
~160 kB (34%) is the JSON-schema editor layer — Renovate's 373 kB schema
JSON (32 kB gz), the markdown-it + shiki hover/completion stack (~56 kB
gz), json-schema tooling (~32 kB gz) and `yaml`/`json5` preload chunks —
all fetched before first paint because `ConfigEditor`/`preset-hover`
import `codemirror-json-schema` statically. Meanwhile the **~437 kB gzip
engine set** starts downloading only on the Run click, serializing a
multi-second fetch behind the user's first interaction, and several async
paths serialize work that is independent (share-link open: decode →
engine fetch → run; `run()`: engine import → OAuth token refresh; OAuth
callback: token exchange → cosmetic profile fetch → share decode).

## User story

As a first-time visitor I see a usable editor sooner; as a user pressing
Run (or opening a shared link) the engine is already downloaded, so the
pipeline starts immediately instead of after a ~1.4 MB fetch.

## Scope

- **Lazy schema layer** (~160 kB gz off first paint): mount CodeMirror
  with plain `@codemirror/lang-json` inside a `Compartment`; after mount,
  `import()` `codemirror-json-schema` + the engine schema entry and
  reconfigure the compartment. Load the json5 variant only in the
  `.json5` branch. Schema lint/hover appears a beat after first paint;
  typing is unaffected.
- **Engine preload** : `requestIdleCallback(() => void import(engine))`
  after first paint, plus pointer-enter/focus preload on the Run button
  (idempotent, module-cached).
- **Async de-serialization**: share-link open starts the engine fetch
  during decode (the version-drift notice must not block the run — fire
  it when it lands); `run()`/`loadRepoConfig` start the OAuth token
  refresh concurrently with the engine import (`Promise.all`); the OAuth
  callback resolves as soon as the token is stored, with the profile
  fetch (toolbar chip only) landing later.
- **Lazy results half** (~37 kB gz): a single `React.lazy` split point
  around the results column moves `react-diff-view` + `diff` and all
  result-only components out of the entry chunk — they cannot render
  before a run, which necessarily downloads the far larger engine first,
  so the split is imperceptible.
- **zod off the critical path** (11.7 kB gz): split `input-schemas.ts`
  into zod-free guards (used by App/run at boot) and zod schemas
  (share decode, OAuth — both already async at their call sites, so the
  schema module can be `import()`ed at point of use).
- Measure before/after in the CI build step; record the numbers in this
  entry when done.

## What was done

- **Lazy schema layer**: `ConfigEditor` mounts with plain
  `@codemirror/lang-json` inside a `Compartment`; a post-mount effect
  `import()`s the new `editor-schema.ts` (codemirror-json-schema + the
  engine schema entry + the 023 preset-hover card, which moved there so
  `preset-hover.ts` — statically imported by App for the lookup side —
  no longer drags the schema stack into the entry) and reconfigures the
  compartment in place. The json5 variant (`codemirror-json-schema/json5`
  → codemirror-json5 → the json5 parser) sits behind a further `import()`
  taken only in the `.json5` branch.
- **Engine preload**: `preloadRunChunks` (App.tsx) fires from a
  `requestIdleCallback` after first paint (setTimeout fallback for
  Safari) and from pointer-enter/focus on the Run button; it warms the
  engine chunk and the results-column chunk. Idempotent (module-cached).
- **Async de-serialization**: `loadShareToken` starts the engine
  download (`getRenovateVersion()`, the cached engine import) before the
  decode and no longer awaits it before the run — the version-drift
  notice fires whenever the version lands; `run()`/`loadRepoConfig`
  `Promise.all` the engine import with the OAuth refresh (both settle
  before `setPresetAuth`, and `suppressTokens` still skips the refresh
  entirely); `completeCallback` resolves once the token is stored,
  returning the cosmetic profile fetch as a never-rejecting promise the
  toolbar chip consumes when it arrives (a profile failure no longer
  fails a sign-in whose token was already stored).
- **Lazy results half**: the whole `panels` record + `ResultsPanel`
  shell moved to `components/ResultsColumn.tsx` behind one `React.lazy`
  boundary in App (Suspense fallback null; the chunk is warmed at idle
  and on Run intent, and a resolved lazy component never re-suspends, so
  the always-mounted 028 shell is never torn down). `react-diff-view` +
  `diff` + every result-only component (and react-diff-view's CSS) ride
  that chunk.
- **zod off the critical path**: `input-schemas.ts` is now zod-free
  predicates only; the schemas moved to `input-schemas-zod.ts`, built ON
  those predicates and reached via `import()` from share.ts encode/decode
  and oauth.ts's exchange/refresh/profile paths. Two call sites that are
  synchronous on the boot path went predicate-only instead of async:
  `readCallbackParams` (new `isValidOAuthParam`) and `getStoredUser`
  (`sanitizeStoredUser` rewritten zod-free) — same rules, proven by the
  unchanged test cases.
- **CI**: `scripts/report-entry-size.mjs` prints the gzip size of the
  entry set (entry script + modulepreload graph + stylesheet) from the
  built dist; wired into ci.yml right after the build step.

## Measured (production build, vite reporter gzip)

Entry set = everything fetched before first paint (entry script +
modulepreload'ed chunks + stylesheet).

|           | before                                                                               | after                                                                                  |
| --------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| entry JS  | **470.4 kB gz** (index 415.87 + yaml 32.11 + json5 10.03 + zod 11.68 + runtime 0.70) | **222.9 kB gz** (index 218.57 + jsx-runtime 2.99 + runtime 0.70 + preload-helper 0.67) |
| entry CSS | 7.22 kB gz                                                                           | 6.66 kB gz (react-diff-view style now lazy)                                            |

**−247.5 kB gz (−53%)** off the critical path. Now lazy: the schema
layer (editor-schema 33.30 + its markdown/json-schema "completion"
chunk 116.76 + yaml 31.54 + json5 10.03), the results half
(ResultsColumn 44.54 incl. react-diff-view + diff), and zod
(api 11.68 + input-schemas-zod 1.75). The remaining entry is React +
CodeMirror core + the app shell. The engine set (~437 kB gz) is
unchanged but now starts downloading at idle/hover instead of on the
Run click, and share-link opens overlap it with the decode.

## Out of scope

- Any change to what is validated (030) or rendered — pure loading order.
- Service worker / offline caching.

## Dependencies

- 001 (engine chunk boundary), 003 (schema editor layer), 028 (results
  column as the split point), 030 (input-schemas split).
