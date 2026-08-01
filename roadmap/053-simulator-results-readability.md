# 053 — Simulator: results readability

Milestone: — · Status: proposed (2026-08-01) — mockup awaiting a variant
decision

Mockup (three variants):
[mockups/053/simulator-results-readability.html](mockups/053/simulator-results-readability.html)

Research basis (commissioned for this work):
[2026-08-simulator-readability-research.md](2026-08-simulator-readability-research.md)
— how DevTools, Compiler Explorer, rule/policy engines (Stripe Radar, IAM
simulator, GCP Policy Troubleshooter, LaunchDarkly), CI systems, Terraform
plan, and tracing UIs lay out dense rule-evaluation evidence.

## Problem

047 staged the simulator into ask / answer / evidence and the verdict is no
longer buried — but the evidence layers themselves still overwhelm once
opened (reported 2026-08-01, screenshot of the oxlint 1.75.0 → 1.76.0 run
against 719 rules):

- The same three facts (the changed settings) render at three grains —
  verdict ledger, per-rule "applied" lists, step diffs — with nothing telling
  the reader they are re-reading the same information.
- The merge-step diff renders the whole ~10,700-line config to show three
  changed keys; the Prev/Next/Jump controls compensate for the layout rather
  than serve a task.
- Both drawers open rebuilds the pre-047 wall: ~2,000 px of equal-weight
  monospace, four vocabularies (code, prose, chip, link) per row, and
  "3 of 719" stated four times.

## Proposed variants (see mockup)

- **A — the ledger is the trace.** Each changed setting on the verdict card
  expands into its own causal thread: writing rule with predicate/evaluated
  clause evidence inline, the overridden value struck through, a replay jump.
  Rules/merge drawers demote to one "full trace" line. (DevTools
  Computed-pane model.)
- **B — inspector.** A persistent index rail (rules grouped
  changed / matched-inert / 716-no-match, then replay stops) beside a single
  detail pane; constant page height, rail selection shareable via the URL
  fragment. (Compiler Explorer / Jaeger model.)
- **C — lenses + digest diff.** The two drawers become three mutually
  exclusive lenses (Matched rules · Build replay · Final config) and the step
  diff defaults to a Terraform-style changed-keys digest with a counted
  "unchanged hidden" row. Smallest delta from the shipped architecture.

Shared fixes worth shipping under any variant: the digest diff, saying
"3 of 719" once, demoting provenance chips to dots inside evidence layers,
and naming the "matched but changed nothing" state.

The variants compose; the mockup's suggested sequencing is C-then-A, with B
reserved for a future audit mode.
