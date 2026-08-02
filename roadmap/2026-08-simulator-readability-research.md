# Simulator results readability — research report (2026-08-01)

Commissioned for mockup 054 (Simulator results readability). The 2026-07
progressive-disclosure research ([2026-07-progressive-disclosure-research.md](2026-07-progressive-disclosure-research.md))
covered the _disclosure_ literature and produced 047's three-layer staging
(ask / answer / evidence). This report covers the next question: **how do
established tools lay out the evidence itself** — dense rule-evaluation,
trace, and config-diff data — once the user opens it. Compiled from primary
product documentation; the condensed, decision-mapped version lives inside
[mockups/054/simulator-results-readability.html](mockups/054/simulator-results-readability.html).

## 1. Browser DevTools — the CSS cascade in two panes

- **Styles pane (default)**: every matching rule in cascade order, overridden
  declarations struck through inline — the "loser" marking needs no
  interaction, but finding the winner means scanning the list.
- **Computed pane (opt-in tab)**: only the _winning_ value per property.
  Expanding a property reveals the same cascade list, winner pinned on top,
  each entry a jump-link to its source. Two panes answer two different
  questions cheaply: _what is happening_ (Computed) vs. _why_ (Styles); users
  default to Computed and escalate only when the answer surprises them.
- A third state exists besides won/lost: valid-but-inert declarations (e.g.
  `float` on a grid item) render dimmed with an ⓘ hover explaining why —
  "lost the cascade" and "had no effect" are deliberately not conflated.
- Firefox adds a per-property filter (funnel icon) that highlights every
  occurrence of one property across all rules — "show me only this
  property's history".
  Source: https://developer.chrome.com/docs/devtools/css ·
  https://firefox-source-docs.mozilla.org/devtools-user/page_inspector/

**Transplant.** Renovate's packageRules are a sequential override, not a
specificity cascade, but "final value per key, expandable to the ordered list
of writers with losers struck through" maps one-to-one onto the simulator's
changed-settings ledger.

## 2. Compiler Explorer (godbolt.org) — opt-in panes

Default layout is exactly two panes (source, one compiler's output). Every
further analysis surface — AST, IR, diff-against-another-compiler, execution
— is added via an explicit "Add new…" menu and tiled/resized by the user
(GoldenLayout). The whole workspace (open panes, layout, flags) is encoded in
the URL, so a fully-configured deep-dive is one link away while the landing
experience stays at two panes. Panes are _linked views_: selecting a source
line highlights the matching output lines.
Source: https://github.com/compiler-explorer/compiler-explorer/blob/main/docs/UsingCompilerExplorer.md

**Transplant.** The complexity floor stays fixed (verdict only) while the
ceiling is user-controlled; pane/layout state rides the app's existing
URL-fragment share convention.

## 3. Rule/policy engines — "why did this fire"

- **Stripe Radar**: evaluation order (3DS → Allow → Block → Review, Block
  short-circuits) is shown as a literal ordered list the user can reorder —
  order is a visible artifact, not hidden state. A charge's risk insights give
  the verdict plus contributing signals in plain language above the raw data.
  Source: https://docs.stripe.com/radar/rules
- **AWS IAM policy simulator**: headline is binary allowed/denied; below it,
  per-statement explains (matched/not-matched action, resource, condition).
  Community tooling labels which statements were _decisive_ — the trace is
  pre-filtered to the causally relevant subset, never an undifferentiated
  statement dump.
  Source: https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_testing-policies.html
- **Google Cloud Policy Troubleshooter**: deny evaluates before allow and the
  _order_ is part of the explanation — a deny hit ends the story without
  enumerating allow policies. Verdict is separated from the hierarchy-grouped
  policy walk.
  Source: https://cloud.google.com/policy-intelligence/docs/troubleshoot-access
- **Skyhigh SWG rule tracing**: each matched criterion shows two parts — the
  _predicate_ (what the rule checks) and the _evaluated value_ (what the
  runtime value actually was). Skipped-at-group-level, evaluated-but-unmatched,
  and matched are three distinct visual states; exactly one action per trace
  gets the "this was decisive" color.
- **LaunchDarkly evaluation reasons**: the result is `{value, reason}` with a
  closed reason enum (`TARGET_MATCH`, `RULE_MATCH`, `FALLTHROUGH`, …); on
  `RULE_MATCH` the reason carries the one rule index that matched — "why"
  drills exactly one level, no scanning.
  Source: https://launchdarkly.com/docs/sdk/concepts/evaluation-reasons

**Common thread.** The verdict is always a small fixed-vocabulary value, and
"why" is _structured, pre-computed, decisive-subset_ data — never the full
checked-rules list left for the viewer to sift.

## 4. CI systems — severity-driven default expansion

GitHub Actions and Buildkite both auto-expand **failed** steps and collapse
everything else: the default disclosure state is a function of severity, not
of order or type. GitHub's Step Summary is a curated markdown surface
independent of the raw log; Buildkite keeps a persistent state-colored step
sidebar, collapses chatty log subsections into labeled bars, and deep-links
to single log lines. "Jump to next failure" navigates by severity, not by
scroll position.
Sources: https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#adding-a-job-summary ·
https://buildkite.com/docs/pipelines/configure/managing-log-output

**Transplant.** Matched rules render open, the ~716 non-matches collapse to
one counted row; a merge step that changed nothing visually recedes.

## 5. Cloudflare WAF security events — filter the list, group the detail

The event list is filterable (action, rule source, path) _before_ opening any
event; the detail view is organized by "what produced this decision" (managed
ruleset vs. custom rule vs. rate limit); the verbose payload is a separate
opt-in layer even inside the detail view.
Source: https://developers.cloudflare.com/waf/analytics/security-events/

## 6. Terraform plan output — the config-diff analogue

Per-attribute diff with `~` / `+` / `-` prefixes and inline `old -> new` for
**changed attributes only**; unchanged attributes are explicitly elided with
a count — `# (12 unchanged attributes hidden)` — never silently omitted and
never fully listed. Terraform's own documented failure mode ("plan noise" /
phantom diffs) shows the flip side: false-positive changed fields erode the
trust that makes a digest diff scannable at all.
Source: https://developer.hashicorp.com/terraform/cli/commands/plan

**Transplant.** This is the closest existing analogue to "which settings the
rules changed" and is worth adopting near-verbatim for the step diff: changed
keys only, with a counted, clickable elision row for the rest.

## 7. Tracing waterfalls (Jaeger) — sequence + one detail panel

The root view is a compact waterfall, one bar per span, colored by status —
"where did the interesting thing happen" before any click. Clicking a span
opens a detail panel _beside_ the waterfall; the waterfall never leaves the
screen, acting as a persistent spatial index. Expand-all and per-span
collapse both exist.
Source: https://www.jaegertracing.io/docs/frontend-ui/

**Transplant.** The merge replay (base → merges → flatten → final) is a
sequence, not a set: a persistent compact timeline with a single detail pane
beats N stacked full diffs. (046 already chose this shape; the remaining gap
is the size of the diff inside the pane.)

## 8. Named patterns (decision shorthand for the mockup)

1. **Verdict/Computed split** — default view is the winning value per key;
   the full audit trail is one explicit switch away. Fails only for users
   whose primary task is auditing — keep a persistent, cheap entry point.
2. **Decisive-subset pre-filtering** — label rules matched-and-decisive /
   matched-but-overridden (or inert) / not-matched; collapse the third to a
   count, expand the first by default.
3. **Severity-driven default expansion** — open/closed state derives from
   "did it change anything", never from position.
4. **Opt-in panes over stacked sections** — evidence surfaces are added, not
   pre-stacked; selection rides the URL fragment.
5. **Typed, causally-ordered "why"** — state the merge order and
   last-writer-wins per key explicitly; note per-key exceptions (array
   concat) rather than letting a single framing mislead.
6. **Predicate/evaluated two-part clause** — every matcher row shows what it
   checks _and_ the runtime value it saw (047's clause list already does
   this; keep it — the persona study called it "the money shot").
7. **Elided-but-acknowledged collapse** — every hidden set renders as a
   counted "N hidden — show" row. Non-negotiable wherever 2/3 collapse.
8. **Persistent spatial index + one detail panel** — for the replay
   specifically; a "pin this step" affordance only if comparing non-adjacent
   steps proves common.

## Evidence caveat

Quantitative UX data specific to dense technical-trace tools is thin in
public sources; the citable numbers (NN/g's task-completion gains and 2-level
cap) are from the general progressive-disclosure literature already compiled
in the 2026-07 report. The per-tool patterns above are validated by longevity
under heavy technical-user scrutiny (DevTools, Actions, Terraform: 5–10+
years of iteration), not by published A/B data.
