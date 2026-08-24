# 053 — Analytics: CI is not an audience

Milestone: M14 · Status: done

## Summary

User-reported (2026-08-02, with screenshot): the GA4 "top hostname by active
users" report for Jul 26 – Aug 1 2026 shows ~5,300 users on `localhost`,
dwarfing both `renovate.secustor.dev` and `secustor.dev`. The traffic is our
own CI, not people:

1. The `build` job inlines the repo variable `VITE_GA_MEASUREMENT_ID` (set
   2026-07-28) into the bundle, and `main.tsx` calls `initAnalytics()`
   unconditionally.
2. That same `dist` is the `app-dist` artifact the `e2e` job downloads and
   serves with `vite preview` on `http://localhost:4322/` — analytics fully
   live, because nothing about the build knows it is being tested.
3. Playwright gives every test a fresh browser context, so there is no `_ga`
   cookie to reuse. Each test is a brand-new user.

60 e2e tests × 88 successful CI runs since the variable was set ≈ 5,280, which
is the number in the report. Renovate PR churn (168 CI runs that week) is what
makes it swamp the real domains. The property's hostname dimension is now the
only thing separating signal from test rig, and every added e2e test makes it
worse.

## User story

As the operator of the hosted deployment, I want the analytics property to
count visitors, so that a week of dependency bumps does not read as a traffic
spike — without taking tracking away from a self-hoster who configured their
own property.

## Scope

- The build-time measurement id (`VITE_GA_MEASUREMENT_ID` — the hosted
  property's) is used only when the page is served from a real hostname.
  Loopback names, the reserved `.localhost` TLD and the empty `file://`
  hostname never load gtag.js.
- The runtime id (`globalThis.__RCD_ANALYTICS__`, from `RCD_GA_MEASUREMENT_ID`
  via `/rcd-config.js`) is deliberately exempt and keeps its short-circuit
  ahead of the guard. It names the deployer's own property, and a container
  reached at `localhost:8080` is a real deployment of theirs, not our test rig.
- Hostname matching is exact or dot-suffixed, never a substring:
  `localhost-mirror.example.com` is somebody's host.

## Out of scope

- CI changes. The id still ships in every build artifact; the guard is what
  makes that harmless. (Considered and rejected as the primary fix: building
  clean and injecting the id into `dist/rcd-config.js` only for the Pages
  deploy. It would leave a local `vite preview` of a GA-enabled build
  reporting, which is the same class of bug.)
- The GA-side cleanup, which cannot be done from the repo: a data filter
  excluding hostname `localhost` going forward (filters are not retroactive)
  and a segment excluding it when reading the existing rows.

## Dependencies

- 043 (the dual-source config rule this extends), 020 (the e2e suite whose
  every test was being counted).

## Delivered

- `isTrackableHostname` in `src/platform/analytics.ts`: a pure predicate over
  a `LOCAL_HOSTNAMES` set (`""`, `localhost`, `127.0.0.1`, `0.0.0.0`, `::1`,
  `[::1]` — `location.hostname` reports IPv6 literals bracketed) plus a
  `.localhost` suffix test, lowercased first.
- `getMeasurementId` now takes the hostname as a parameter — a parameter and
  not a `location` read, so the resolution logic stays testable in the
  node-environment "unit" project. `initAnalytics()` is the one injector and
  passes `window.location.hostname`, matching the module's existing "pure
  logic + one injector" shape.
- Unit coverage (`analytics-config.test.ts`): the build-time id suppressed on
  every local hostname, the self-host runtime id still honoured on
  `localhost`, and the substring trap (`localhost-mirror.example.com`,
  `mylocalhost.example.com`, `127.0.0.1.example.com` all trackable).
- New permanent e2e assertion (`e2e/16-analytics-localhost.spec.ts`): a full
  load-and-run records zero requests to Google's analytics hosts and asserts
  `dataLayer` is never created. Vacuous against a local build (no id is
  inlined), non-vacuous in CI and under the documented local repro
  (`VITE_GA_MEASUREMENT_ID=G-TEST1234 pnpm --filter …/app build`), where it
  fails without the guard.

## Deferred

- None.
