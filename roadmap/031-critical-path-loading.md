# 031 — Critical-path loading performance

Milestone: M9 · Status: planned

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

## Out of scope

- Any change to what is validated (030) or rendered — pure loading order.
- Service worker / offline caching.

## Dependencies

- 001 (engine chunk boundary), 003 (schema editor layer), 028 (results
  column as the split point), 030 (input-schemas split).
