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
  _are_ RE2-supported. A lint must not false-positive on them.

Mitigation options, cheapest first:

1. **Static pattern lint** (~50 lines, pure, no upstream dep): flag `(?=`,
   `(?!`, `(?<=`, `(?<!`, `\1`, `\k<…>` and surface "RE2 rejects this; real
   Renovate would fail validation". Deliberately narrow and honest about being
   a heuristic. Recommended.
2. Bundle a WASM RE2 build and use it as the engine. Highest fidelity, but a
   new large dependency and a second engine to keep in step — worth pricing
   separately, not in a first version. (I have not verified any specific WASM
   RE2 package works in this bundle.)

Precedent for shipping a known, named gap exists: `conda` versioning is
excluded and reports an honest error (CLAUDE.md).

## 4. Effort

Roughly **one week** for a version worth shipping; **1–2 days** for a
demonstrable proof of concept. Split:

**Engine — ~0.5–1 day.** A `simulate-custom-managers.ts` (~250 lines) beside
`simulate-package-rules.ts`: 3 new re-exports in `renovate-adapter.ts`, input =
`{ files: {path, content}[], config }`, run `getMatchingFiles` per custom
manager, run `extractPackageFile`, collect the logger trace, return per-file
results. Match spans come from `indexOf(replaceString)` — upstream's own
auto-replace anchor, so no second regex pass to drift from. Plus the RE2 lint.
Tests: a golden/shimmed pair on RE2-safe fixtures.

**App — ~2–3 days, the bulk.** A file-input surface (path + content, ideally
n files) and a results view. New results tab, wired into `results-tabs.ts`.
The reusable parts of the existing simulator (drawers, evidence cards, thread
nav) do not transfer directly — this is a different shape of answer.
`jsx-max-depth: 3` means decomposition up front, not after.

**Polish — ~2 days.** Share-link encoding for file contents (needs a size cap;
the fragment is deflated but not free), e2e coverage, docs, roadmap entry.

**The `warnOnMismatch` idea itself is the cheap part** (~50 lines): given the
matched spans, flag any line matching a probe pattern (default `#\s*renovate:`)
that falls outside all of them. Pure, testable, no upstream dependency — and it
lets this app demonstrate the feature while #45071 is still an open idea.

Biggest unknown is not technical: **how many files at once**. One file keeps
the UI trivial; a repo's worth is what actually reproduces "which of my 200
Dockerfiles has the typo", and pulls in the repo-fetch path (007) and
`ignorePaths`/`includePaths`.

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
