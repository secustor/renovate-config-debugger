# @renovate-config-debugger/engine

Renovate's own config pipeline — parse, migrate, massage, validate, resolve
presets, merge, re-migrate, and simulate `packageRules` — running **in a
browser**, with a trace of every stage. It is the engine behind
[renovate-config-debugger](https://github.com/secustor/renovate-config-debugger),
extracted so anything else can reuse it.

## License: AGPL-3.0-only

**Read this before you install it.** This package runs Renovate's real code
(the [`renovate`](https://github.com/renovatebot/renovate) package is
`AGPL-3.0-only`) and is therefore `AGPL-3.0-only` itself. Linking it into a
network-accessible product puts that product under the AGPL's source-offer
obligation. That is a property of running the real pipeline; the alternative is
reimplementing Renovate's config semantics, which is exactly what this project
refuses to do. The full text is in [LICENSE](./LICENSE).

## What you get

Three entry points, and nothing else is public API:

| Entry point                                    | What it is                                                                                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@renovate-config-debugger/engine`             | `runPipeline()` and the trace model, the `packageRules` simulator, provenance and resolved-config derivations, preset auth, error translations, option docs |
| `@renovate-config-debugger/engine/schema`      | Renovate's own JSON schema, stripped of the `%`-prefixed keys that break JSON-pointer tooling                                                               |
| `@renovate-config-debugger/engine/vite-plugin` | `renovateShims()` — the Vite plugin that makes the two above work off a server                                                                              |

## Install

```sh
pnpm add @renovate-config-debugger/engine
```

The `renovate` package comes with it as an **exact** dependency (see the pin
below). It is large — this is not a small install.

`vite` is an optional peer dependency, needed only by the `./vite-plugin`
entry: that module is build-time Node code (`node:module`, `node:path`,
`node:url`) and must never reach a browser graph.

## Use

`renovateShims()` swaps Renovate's Node-only choke points (OpenTelemetry,
bunyan, `re2`, datasource lookups, preset HTTP clients) for browser-safe
modules, and the logger shim doubles as the trace collector — **without the
plugin there is no trace, and most of the pipeline will not even load.**

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { renovateShims } from "@renovate-config-debugger/engine/vite-plugin";

export default defineConfig({ plugins: [renovateShims()] });
```

```ts
// anywhere in the browser bundle
import { runPipeline } from "@renovate-config-debugger/engine";

const trace = await runPipeline({
  fileName: "renovate.json",
  content: '{ "extends": ["config:recommended"] }',
});

console.log(trace.stageStatus); // per-stage ok/error/skipped
console.log(trace.finalConfig); // what Renovate would run with
console.log(trace.presetTree); // the `extends` tree, from Renovate's own logs
```

Preset fetching is plain `fetch()` against the CORS-enabled host APIs
(GitHub, GitLab, Gitea/Forgejo, npm, plain HTTP). A host that does not send
CORS headers cannot be resolved from a browser — that is the network's answer,
not this package's.

## This consumes a non-public API

Renovate's config modules (`renovate/dist/config/**`) are internals, not an
exported interface. A Renovate release can move a file and break the pipeline
with no semver signal at all. Two consequences:

- **The `renovate` dependency is pinned exactly, never ranged.** A range would
  let an install hand this package internals it was never tested against.
- **A Renovate bump is a release of this package**, not an implementation
  detail. Every bump runs the full test suite: a golden project against
  untouched Renovate modules, and a shimmed project over the exact browser
  module graph, which must produce byte-identical results.

`renovateVersion` is exported for the same question at runtime.

## Versions

`0.x`, and a **minor bump may be breaking** until the export surface settles —
range against `^0.1` (i.e. not across the minor), not `^0`. No `1.0.0` is
scheduled; it is a decision to make once the exports stop moving.

Every release records the Renovate it reproduces:

| engine | renovate | renovate schema |
| ------ | -------- | --------------- |
| 0.1.0  | 44.4.6   | 44.4.6          |

The schema column is the `renovate-schema.json` shipped by that same
`renovate` version — the `./schema` entry is a filtered copy of it, never a
hand-maintained one.

## Not in scope

- **Non-Vite bundlers.** The shim mechanism is a `resolveId` redirect and can
  be ported (the plugin is ~100 readable lines), but only Vite is shipped and
  supported here.
- **Plain Node without a bundler.** The emitted ESM is bundler-targeted; a
  Node entry point would need a loader hook and is its own piece of work.
- **`matchCurrentVersion` for `conda`.** Its ~3 MB WASM parser is excluded
  from the browser build on purpose; such clauses report an honest error
  instead of silently mis-evaluating.

## Contributing

Issues and PRs go to
[secustor/renovate-config-debugger](https://github.com/secustor/renovate-config-debugger).
