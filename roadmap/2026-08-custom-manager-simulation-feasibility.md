# Custom-manager (regex/JSONata) simulation — feasibility spike (2026-08-05)

Prompted by [renovatebot/renovate#45071](https://github.com/renovatebot/renovate/discussions/45071)
("Detect mistakes in regex manager syntax"): a user writes a `# renovate: …`
comment, gets one character wrong, and Renovate silently extracts nothing.
Upstream is asked for a `warnOnMismatch` option. **This app can answer the same
question today, without an upstream change** — paste the config _and_ a sample
file, see which spans matched, what each match extracted, and which
almost-matches were discarded and why.

This note records what a spike proved about feasibility, and what it would cost.

## 1. What already exists here

The pipeline stops at a resolved config. Nothing in the app has ever taken a
_package file_ as input — that is the whole gap. Everything else is closer than
expected:

| Needed                                   | Status                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `custom.regex` extraction                | upstream `modules/manager/custom/regex/index.js`, browser-safe                                       |
| `custom.jsonata` extraction              | upstream `modules/manager/custom/jsonata/index.js`, browser-safe                                     |
| `managerFilePatterns` matching           | upstream `workers/repository/extract/file-match.js` (`getMatchingFiles`), browser-safe               |
| handlebars (`*Template` fields)          | **already in the bundle** — `config/validation.js` imports `util/template`                           |
| jsonata, minimatch                       | **already in the bundle** — same import chain (`util/jsonata`, `util/string-match`)                  |
| "dep discarded, failed validation" trace | **free** — `checkIsValidDependency` calls `logger.trace`, and `shims/logger.ts` forwards every level |

The only genuinely new runtime dependency is `toml-eslint-parser` (~100 KB
unpacked), and only for JSONata managers with `fileFormat: "toml"`.

## 2. Spike result

A throwaway test in the engine's `shimmed` project (the exact browser module
graph) imported the three upstream entry points above and ran them. All six
assertions passed on the first run, unmodified:

- regex manager extracted `jqlang/jq @ 1.7.1` from a Dockerfile sample, and
  correctly extracted **nothing** from the deliberately typo'd
  `# renovate: datasoure=…` comment below it — the exact failure #45071 is about;
- `depNameTemplate: "prefix/{{{depName}}}"` compiled through handlebars;
- JSONata manager parsed YAML and evaluated `deps.{ "depName": name, … }`;
- `getMatchingFiles` resolved `**/[Dd]ockerfile*` against a file list.

**No new shims were required.** The extraction path never touches `fs`, `git`,
`exec`, or the datasource layer.

Reproduce: see the appendix at the end of this file.

## 3. The one real fidelity gap: RE2

Production Renovate compiles `matchStrings` with **RE2**, via
`expose.js → util/regex.js`. The browser's `expose.ts` shim throws for `re2()`,
so `regEx()` falls back to native `RegExp` (`regexEngineStatus: "unavailable"`,
confirmed in the spike). RE2 does not support lookahead, lookbehind, or
backreferences; native `RegExp` does. So a pattern using `(?= …)` **works here
and fails in production Renovate** — the worst possible direction for a tool
whose value is trust.

Two things make this awkward beyond the usual shim caveats:

- The golden/shimmed byte-identity regime does **not** catch it. In this
  checkout `re2`'s native binary is unbuilt (`Cannot find module
'./build/Release/re2.node'` on Node 26), so the golden project _also_ falls
  back to native and the invariant passes vacuously. Verified, not assumed.
- Named capture groups — `(?<depName>…)`, the thing every custom manager uses —
  _are_ RE2-supported, so whatever checks patterns must not flag them.

### 3.1 Can native `RegExp` be configured to behave like RE2?

**No.** There is no flag, option, or constructor argument in any shipping
browser that restricts `RegExp` to the RE2 language. Two near-misses, both
measured:

- **V8's linear-time engine is real but not web-reachable.** V8 ships a
  non-backtracking engine behind an `l` flag that rejects precisely the
  non-regular constructs: `new RegExp("a(?=b)", "l")` fails with _"Cannot be
  executed in linear time"_. But it requires `--enable-experimental-regexp-engine`
  at V8 startup — verified: without it, even `new RegExp("a", "l")` is a
  `SyntaxError`. It is not exposed to web content, and Firefox and Safari have
  no equivalent at all.
- **It would only fix one direction anyway.** `l` covers "JS accepts what RE2
  rejects". It does nothing for "RE2 accepts what JS rejects" — verified below.

The divergence is genuinely two-way, and one class of it is silent:

| Construct                 | RE2     | native `RegExp`       | Direction                                |
| ------------------------- | ------- | --------------------- | ---------------------------------------- |
| `(?<name>…)` named group  | accepts | accepts               | — (what real configs use)                |
| lookahead `(?=`, `(?!`    | rejects | accepts               | works here, fails in prod                |
| lookbehind `(?<=`, `(?<!` | rejects | accepts               | works here, fails in prod                |
| backref `\1`, `\k<n>`     | rejects | accepts               | works here, fails in prod                |
| inline flags `(?i)`       | accepts | **`SyntaxError`**     | fails here, works in prod                |
| POSIX `[[:alpha:]]`       | letters | **matches `[:alph]`** | **silent** — no error, different matches |
| `\p{L}` without `u`       | letters | **literal `p{L}`**    | **silent** — no error, different matches |

The last two are the reason a static lint is not sufficient: both engines
compile the pattern without complaint and simply match different things.

### 3.2 Recommended: `re2js` as an oracle, not as the engine

[`re2js`](https://www.npmjs.com/package/re2js) is a pure-JS port of RE2 (no
WASM, no native binding), actively maintained, **60 KB gzipped** (246 KB raw).
Probed against every row above: it reproduces RE2's accept/reject decisions
exactly, and matches `[[:alpha:]]+` against `"abc"` where native `RegExp`
returns `null`.

Use it **beside** native `RegExp`, not instead of it:

- **Extraction keeps using upstream's own code path** (native `RegExp` via
  `regEx()`), so what the app shows is produced by Renovate's real functions.
- **`re2js` compiles each `matchString` as a validator**, giving exact,
  non-heuristic verdicts in _both_ directions: "RE2 rejects this — Renovate
  would fail validation", and "this is valid RE2 that cannot be previewed in a
  browser" instead of a bogus syntax error.
- **Running both engines over the sample file catches the silent cases**: if the
  match spans differ, warn. That is an empirical check no static lint can make.

Swapping `re2js` in as the engine (via the existing `expose.ts` `re2()` slot)
is the higher-fidelity option but materially more work: `re2js` is not
RegExp-API-compatible, so the shim would have to implement `exec` with
`lastIndex` advancement, `test`, and the well-known symbols
(`Symbol.replace`/`Symbol.match`) that Renovate relies on via
`String.replace(regEx(…), …)` — and each unimplemented symbol is a silent
break. Not for a first version.

**Reassurance on priority:** all 60 `matchStrings` in Renovate's own bundled
`custom-managers` presets use named groups and nothing else — zero RE2-only or
JS-only constructs. The common subset is where real configs live, so this is an
edge-case guard, not a blocker. Precedent for shipping a known, named gap
exists: `conda` versioning is excluded and reports an honest error (CLAUDE.md).

## 4. Decided design

Two decisions are settled and should not be re-litigated during build.

### 4.1 The preprocess input lives in `ConfigColumn`

The files being matched are **input**, not results — they belong on the input
half of the split, in `ConfigColumn.tsx`, alongside the config editor, its
toolbar and the Advanced zone. Not in a results tab, and not in a modal.

This means `ConfigColumn` has to grow a representation it does not have today:
**a set of `{ path, content }` pairs**, not a single text buffer. Concretely:

- The path is a first-class field, not decoration — `managerFilePatterns`
  matches against it, so `Dockerfile` vs `docker/Dockerfile.ci` changes the
  answer. Every content buffer needs an editable path next to it.
- More than one file must be representable, because "which of my files does
  this manager miss?" is the question being asked; a single-file input answers
  a strictly weaker one.
- `ConfigColumn` already threads its state through props (it is a presentational
  component — ~30 props, no local state). Adding an n-file list this way would
  make the prop list unmanageable, so the file set should arrive as one grouped
  prop (or a small already-constructed element, the pattern `advancedZone`
  already uses) rather than as a dozen new flat props.
- `jsx-max-depth: 3` applies: the file list is its own component under
  `features/editor/`, not nesting inside the existing editor card.

### 4.2 Extraction runs on demand, never across all files

Do **not** extract from every file on every keystroke, or even on every run.
Each file × each custom manager is a full regex sweep with a 10 000-iteration
ceiling per `matchString` (upstream's `regexMatchAll` cap), plus handlebars
compilation per matched dependency — the cost scales with
`files × managers × matchStrings` and lands directly on the typing path the
`render` vitest project exists to protect.

Instead:

- Extraction is triggered per file, on explicit demand — opening/selecting that
  file's result, or an explicit action — not as a batch pass over the set.
- Results are memoized per `(file content, manager config)` pair so a re-render,
  or reselecting a file, costs nothing.
- Anything that must be shown for all files at once (e.g. a "3 files matched no
  dependencies" summary) should be derived from the cheap step only —
  `getMatchingFiles` on paths, which touches no file content — with the
  expensive extraction still deferred until that file is opened.

This also keeps the door open to the repo-fetch path (007) later: a repo's worth
of files can be listed and pattern-matched cheaply, with content fetched and
extracted only for the file the user actually opens.

## 5. Effort

Roughly **one week** for a version worth shipping; **1–2 days** for a
demonstrable proof of concept. Split:

**Engine — ~1 day.** A `simulate-custom-managers.ts` (~250 lines) beside
`simulate-package-rules.ts`: 3 new re-exports in `renovate-adapter.ts`, input =
`{ files: {path, content}[], config }`, split into the cheap path-only step
(`getMatchingFiles`) and the per-file extraction step 4.2 defers, run
`extractPackageFile`, collect the logger trace, return per-file results. Match
spans come from `indexOf(replaceString)` — upstream's own auto-replace anchor,
so no second regex pass to drift from. Plus the `re2js` oracle (§3.2), lazily
imported so its 60 KB stays off the critical path (031). Tests: a golden/shimmed
pair on RE2-safe fixtures, and a pure unit test for the oracle's verdicts.

**App — ~2–3 days, the bulk.** The `ConfigColumn` file-set input of §4.1 and a
results view for what came out. New results tab, wired into `results-tabs.ts`.
The reusable parts of the existing simulator (drawers, evidence cards, thread
nav) do not transfer directly — this is a different shape of answer.
`jsx-max-depth: 3` means decomposition up front, not after.

**Polish — ~2 days.** Share-link encoding for file contents (needs a size cap;
the fragment is deflated but not free), e2e coverage, docs, roadmap entry.

**The `warnOnMismatch` idea itself is the cheap part** (~50 lines): given the
matched spans, flag any line matching a probe pattern (default `#\s*renovate:`)
that falls outside all of them. Pure, testable, no upstream dependency — and it
lets this app demonstrate the feature while #45071 is still an open idea.

Remaining open question: how the file set is **populated** — hand-authored
entries only, or fed from the repo-fetch path (007), which also brings
`ignorePaths`/`includePaths` into scope. §4.2's split (cheap path matching now,
content extraction on demand) is what makes the repo-scale version tractable
later, so the first version should not foreclose it.

## Appendix — reproducing the spike

Add to `packages/engine/vitest.config.ts` under the `shimmed` project's
`include`, then run
`pnpm --filter @renovate-config-debugger/engine exec vitest run --project shimmed`:

```ts
import { extractPackageFile as regexExtract } from "renovate/dist/modules/manager/custom/regex/index.js";
import { extractPackageFile as jsonataExtract } from "renovate/dist/modules/manager/custom/jsonata/index.js";
import { getMatchingFiles } from "renovate/dist/workers/repository/extract/file-match.js";
import { regexEngineStatus } from "renovate/dist/util/regex.js";

const dockerfile = `FROM alpine:3.20

# renovate: datasource=github-releases depName=jqlang/jq
ARG JQ_VERSION=1.7.1

# renovate: datasoure=github-releases depName=typo/typo
ARG TYPO_VERSION=1.0.0
`;

const matchStrings = [
  "# renovate: datasource=(?<datasource>[a-zA-Z0-9-._]+?) depName=(?<depName>[^\\s]+?)\\s(?:ENV|ARG)\\s+[A-Za-z0-9_]+?_VERSION[ =\"']?(?<currentValue>.+?)[\"']?\\s",
];

const res = regexExtract(dockerfile, "Dockerfile", { matchStrings } as never);
// → 1 dep (jqlang/jq @ 1.7.1); the `datasoure=` typo yields nothing
```
