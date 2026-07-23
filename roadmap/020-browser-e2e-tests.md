# 020 — Browser end-to-end test suite

Milestone: M6 · Status: planned

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
