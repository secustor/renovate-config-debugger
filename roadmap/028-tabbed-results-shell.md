# 028 — Tabbed results shell (post-run progressive disclosure)

Milestone: M8 · Status: done

## Summary

Everything the pipeline produces currently renders at once, stacked
vertically: stage timeline + stage diff, migration stepper, a
1,000-node preset tree, the effective config, the messages panel and the
simulator. Pressing Run answers every question simultaneously, which for a
first-time user answers none — the 2026-07 design review found the post-Run
screen overwhelming. A survey of comparable "input → run → results" tools
(regex101, TypeScript Playground, AST Explorer, Compiler Explorer, jqplay,
crontab.guru, explainshell) converged on three patterns we currently violate:
the default view after running is a short summary, never a dashboard; large
mutually-exclusive views live behind tabs with ambient counts; and detail is
question-oriented, not structure-oriented.

The chosen design (mockup E, iterated through five mockups on 2026-07-25;
reference copy in [mockups/028/](mockups/028/e-final.html)): a two-pane
layout — editor left, one tabbed results panel right — where Run lands on a
compact Overview and every instrument is exactly one tab away, its size
advertised by a count badge.

## User story

As a user pressing Run on `extends: ["config:recommended"]`, I land on a
short overview instead of five expanded instruments, see at a glance that
there are 2 rewrites / 1,076 presets / 23 effective options / 1 warning, and
open exactly the instrument I care about — with my config still visible
beside it.

## Scope

- **Two-pane layout**: editor + toolbar + advanced options left, results
  panel right, on wide viewports; the results panel is sticky so it stays
  in view while the editor column scrolls. Below ~60rem the panes **stack —
  config on top, results below** — same components, one column; after Run
  in stacked mode, scroll the results panel into view (023's
  land-on-the-consequence pattern), otherwise Run appears to do nothing on
  small screens.
- **Tab set**: Overview · Pipeline · Rewrites (n) · Presets (n) ·
  Effective config (n) · Simulator · Problems (n). Count badges are the
  ambient signal (warn/error coloring where applicable). Tabs whose run has
  no content (e.g. Rewrites on an already-migrated config) stay **visible
  but dimmed with a zero count** — never hidden (spatial stability across
  runs), never a blank pane (each tab keeps its explicit "nothing here"
  empty state).
- **Overview tab**: until 029 lands, a plain stat line (the same numbers as
  the tab badges) plus "dig in with a question" pills — "Where did a
  setting come from?" (opens Effective config and focuses its filter),
  "What happens to one of my dependencies?" (Simulator), "What did each
  stage change?" (Pipeline). One navigation system per view: no stage chips
  here.
- **Pipeline tab owns the stage chips**: the chip row is the stage selector
  (exactly today's StageTimeline behavior), the selected stage's diff
  renders below; the Migrate view cross-links to the Rewrites stepper
  ("step through them one by one →").
- **Per-tab state survives switching**: scroll position, tree
  expansion/search/filters, effective-config filters, stepper index,
  selections. Cross-instrument links keep working as tab switches
  (provenance chain badge → preset node in Presets; messages → editor or
  simulator), with a one-step "back to where I was" affordance so a jump
  never loses the user's place.
- **Share links** gain an active-tab field (additive, alongside the
  existing stage/step/node view state); old links map to sensible tabs
  (stage → Pipeline, step → Rewrites, node → Presets).
- Existing instruments are **re-homed, not rewritten** — their internal
  max-heights change to panel-height management, nothing else.
- **Re-validate after landing**: rerun the persona replay (019) — its
  scenarios were scripted against the vertical layout — and update the e2e
  suite (020) selectors.

## Out of scope

- The plain-English run digest for the Overview tab — 029 (this ships the
  stat-line placeholder it replaces).
- Any change to the instruments' internals, resolution semantics, or trace
  format.

## Dependencies

- 002/004/005/006/011 (the instruments being re-homed), 016/023 (scroll and
  post-action-focus ergonomics this must not regress), 017 (share-link view
  state), 024 (stage chips move into the Pipeline tab), 019/020
  (re-validation). 029 builds on this.
