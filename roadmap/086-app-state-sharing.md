# 086 — The App.tsx state-sharing ruling

Milestone: M21 · Status: done (feat/v2)

## The question, and why it is due

048 decomposed App.tsx (1,563 → 1,073) and its termination note deferred the
real question: *"the post-split state-sharing mechanism (props vs context vs
store) — which is where a future item should start."* That item was never
written, and the second cleanup pass measured the consequence: 1,851 lines and
35 state/ref slots — the exact numbers 033 opened with. The trajectory
(1,600 → 1,073 → 1,919 → 1,840 → 1,851) is the evidence that hook extraction
alone does not hold: every feature that touches a run adds a prop through
App's JSX, `ResultsColumnProps`, and the panel — three files for one value —
and the wiring accretes back into App faster than extraction drains it.

## The ruling

Three mechanisms, one each for the three kinds of state App holds:

1. **Run-scoped view state → a context, inside the app layer only.**
   `app/run-view-context.tsx` carries the cluster that changes at run /
   interaction frequency and never on a keystroke: the result and its
   derived counts, the tab machinery, the stage/node/step selections, the
   panel-stat reporting, pins, and the identity-stable handlers the panels
   call. App provides it; `ResultsColumn` and `AppShellHeader` consume it.
   **Features never do** — 048's rule stands, so the feature boundary stays
   props, and the context is an app-layer wiring detail, not an API.

2. **Input clusters → hooks that own their whole story.** The pattern 084
   established (`use-pinned-run`, `use-results-tab`, `use-panel-stats`),
   extended to the two clusters the reviews sized: `use-platform-context`
   (platform/endpoint/global-text/override + the untrusted-endpoint guard and
   the three set-and-persist sites, whose differing persist conditions are
   security-relevant parameters, not a default) and `use-app-messages`
   (fatal/notice/toast/announcement, including the alternating-space device,
   spelled once).

3. **Keystroke-scoped state stays where it is, as props.** `content` and its
   derivations (`resultsStale`, the layer texts and parses) are the 032
   contract's hot path: the keystroke render test counts panel reconciles,
   and a context whose value changes per keystroke would put every consumer
   on that path. They remain explicit props — the churn is the point, and
   props are where churn is visible.

**An external store is rejected**, not deferred: the 032 contract (memoized
panels + latest-ref handlers) already is the subscription discipline a store
would bring, the repo has no second consumer for one, and a new dependency +
idiom for the same render behavior is cost without a defect to spend it on.

## What the context may carry — the rule

A value enters `run-view-context` only if its identity changes on a run, a
tab/stage/node/step selection, or a panel's async report — never on a
keystroke. The provider value is memoized on exactly those inputs; anything
that would churn it per keystroke is disqualified and stays a prop
(`resultsStale` is the canonical example, stated as such on
`ResultsColumnProps`). This is what keeps the keystroke budget the test
enforces: consumers re-render when the run view changes, which is when they
re-rendered anyway.

## What moved

- `app/use-app-messages.ts` — fatal (+ stamp), notice, toast (+ timer),
  the run announcement, and both alternating-space raises.
- `app/use-platform-context.ts` — platform/endpoint state + storage reads,
  global-context reflection (`displayPlatform`/`displayEndpoint`), the
  override snap-back effect, the guard pair (state + same-tick ref), and the
  four handlers; `applyPlatformContext` is the one set-and-persist spelling,
  with persistence an explicit parameter at its three call sites.
- `app/run-view-context.tsx` — the provider type + `useRunView()`.
  `ResultsColumn` reads it for the run-scoped cluster; its props narrow to
  the keystroke-scoped remainder. `AppShellHeader` reads the counts.

## Not moved, deliberately

- The run path (`onRun`/`executeRun`, the queue, the landing-walk handshake)
  — App's irreducible core; it is what App *is*.
- The share/decode wiring (`useShareLink`'s host object) — it exists to
  reach into everything, and hiding that behind a context would only make
  the reach invisible.
- `descriptionLedgerNonce` stays with its 084 caveat: a request counter,
  not a panel stat.
