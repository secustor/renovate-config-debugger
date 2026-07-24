# 020 — Browser end-to-end test suite

Milestone: M6 · Status: done 2026-07-24

> Implemented as a Playwright suite in `packages/app/e2e/`, driven by
> `packages/app/playwright.config.ts`. It runs against the PRODUCTION build
> served by `vite preview` on a fixed port (4322), chromium only, with hard
> timeouts (60s per test, 15s expects, 5-min suite ceiling) so a wedged
> "Running…" fails fast instead of stalling. The dist must be built first:
> the required check order is `build` → `test:e2e`; CI reuses the build step's
> dist rather than rebuilding. `vite.config.ts`'s base path
> (`/renovate-config-visualizer/` under `GITHUB_ACTIONS`, `/` locally) is
> mirrored in the Playwright baseURL so preview and tests agree in both
> environments.
>
> **Fixtures** (`e2e/fixtures.ts`) reuse 019's share-link codec — the
> `deflate-raw` + base64url encode ported to web globals (CompressionStream,
> btoa) so the wire format is byte-identical to `src/share.ts` with no
> dependency on Node-only APIs. All fixture configs are self-contained (no
> `extends`), so preset resolution needs no network and every journey is
> offline-deterministic.
>
> **Five journeys, one test each:** (1) cold share link decodes + auto-runs +
> shows timeline/version badge; (2) the 017 regression — a hash-only
> navigation into an already-mounted app loads and runs, with a second test
> asserting the clobber-confirm fires (and is accepted) when unsaved edits
> exist; (3) paste an invalid config (`automerge: "yes"`) → Run → validate
> error shown → fix in the editor → re-run → error gone, using
> `keyboard.insertText` for CodeMirror-safe bulk input (bracket auto-close
> makes per-char typing unsafe); (4) simulator — the "npm dependency"
> quick-fill matches a minor/patch-scoped automerge rule, asserting the
> verdict block, a matched-rule count ≥ 1, and the applied `automerge → true`
> diff; (5) first-load smoke — welcome strip visible, Advanced options
> collapsed, glossary hover card renders with a docs link.
>
> CI runs the suite after the existing browser-bundle build step
> (`playwright install --with-deps chromium`, then `test:e2e`, reusing the
> dist), and uploads the HTML report as an artifact. Runtime is a few seconds
> of tests plus browser/deps install — total added CI time in the low minutes.

## Summary

The persona-study setup surfaced a class of defects no current check can
catch: real-browser, whole-app behavior. The concrete motivating case: share
links opened in a running app do nothing (017) — invisible to unit tests,
the golden/shimmed suites, the production build, and the dev-graph guard
alike, because it only exists in a live browser session with navigation
history. A stuck "Running…" state (also observed during setup) is the same
class.

## User story

As a maintainer, I want CI to drive the built app in a real browser through
the core user journeys, so regressions like "the share link silently does
nothing" or "the pipeline never finishes" fail a PR instead of a user.

## Scope

- Playwright against the production build served by `vite preview` (the
  study showed `vite dev` cold-starts are not representative and can wedge
  the first engine import — test what users get).
- Journeys, each with a hard timeout so hangs fail rather than stall:
  1. Cold share link: opens, decodes, auto-runs, timeline + version badge
     appear (guards the whole engine-in-browser path).
  2. Share link into a running app: navigate within the app, then to a share
     URL — the shared config must load and run (regression for 017).
  3. Paste → Run → validate error shown → edit config → re-run → error gone.
  4. Simulator: fill descriptor, Simulate, assert a matched rule row and its
     applied diff.
  5. First-load smoke: welcome strip, advanced options collapsed, glossary
     hover card renders with a docs link.
- CI step after the existing checks; keep total runtime in low minutes
  (single browser, chromium only).
- Share-link fixtures generated with the real codec (reuse 019's generator).

## Out of scope

- Cross-browser matrix, visual regression screenshots, and network-dependent
  journeys (preset fetching from live hosts stays covered by engine tests).

## Dependencies

- 001–007 features under test; pairs with 017 (its regression test lands
  here) and 019 (shared scenario/link tooling).
