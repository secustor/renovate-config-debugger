# 054 — Simulator: results readability

Milestone: — · Status: proposed (2026-08-01) · variant A planned in detail
after mockup review (2026-08-02, see below)

Mockup (three variants; revised 2026-08-02 after review — the scenario now
includes a contested field, `groupName` written by two matched rules with the
later one winning, and every key/value ledger aligns its columns):
[mockups/054/simulator-results-readability.html](mockups/054/simulator-results-readability.html)

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

## Variant A — implementation plan (2026-08-02)

Refined in mockup review: no ledger label; no explanatory asides (the
verb carries merge semantics — **set by** vs. **appended by**); the losing
writer's reference is the link; the rule popover shows writes as a
per-outcome digest; clause evidence and every key/value ledger align on
shared columns; the verdict footer is just the two full-trace links.

### Data — a new derivation, no engine changes

The engine already records everything a thread needs:
`SimulationResult.mergeSteps[i].merged` names every key each merge
set/changed **with `before`/`after`**, steps are contiguous snapshots in
merge order, and `RuleEvaluation.clauses` holds the predicate/evaluated
evidence per rule. A new `verdict-threads.ts` derives, per changed key:

- `ThreadModel { key, finalValue, present, verb, winner, overrides[], writerCount }`
  - **winner**: the last stop whose `merged` names the key →
    `{ ruleIndex?, layer, clauses, stopIndex, stopOrdinal }` (flatten stop
    → the 047 update-type story instead of clauses).
  - **overrides**: every EARLIER stop naming the key, newest first, each
    `{ value (that stop's after), ruleIndex?, layer?, stopIndex }`, ending
    with the base value (`mergeSteps[0].before[key]`, labeled "Renovate
    default" when it equals `getDefaultConfig()`'s value, else with the
    owning layer's provenance).
  - **verb**: `set` | `appended` | `removed` — `appended` when both sides
    are arrays and `before` is a strict prefix of `after` (Renovate's
    concat-merge keys); if that heuristic ever misfires, the fallback is an
    engine-side `MergedKey.mode` tag, not app guesswork.
- Replaces `verdict-changes.ts` (`VerdictChange` becomes the collapsed
  row projection of `ThreadModel`) — one module, so the ledger and the
  threads can never disagree.
- Memoized off the last RUN (`[sim, mergeStops, layerByIndex]`), never the
  live form — the 032 keystroke-render rules; the render-project test
  extends to the thread list.

### Components (each ≤ depth 3; no default exports)

- `VerdictThreads` — the `ul.kv` subgrid ledger (columns: key · value ·
  origin dot). Rows are `ThreadRow` (head button, `aria-expanded`,
  caret-in-key cell) + `ThreadBody`.
- `ThreadBody` — writer line (`set by`/`appended by` + `ProvenanceChip`),
  `ClauseGrid`, one `ThreadOverrideLine` per lost writer (struck value;
  rule reference opens the popover; step link jumps), collapsed
  "2 writers" badge on the head when `writerCount > 1`.
- `ClauseGrid` — shared mark · matcher · `checks …` · `· this update is …`
  column grid; used by threads and the popover (variant B/C would reuse
  it too).
- `RuleEvidenceCard` — the popover: rule id + matched badge, `ClauseGrid`,
  "merged in step N — X writes, Y survived", per-write digest rows
  (surviving = plain add tint; lost = add tint + line-through +
  "⊘ overridden in step M"), "open in matched rules →". Light-dismiss
  (Esc / click-away), `role="dialog"`, focus returns to the anchor;
  reuses the 016/025 hover-card plane and overflow handling.
- `ProvenanceChip` gains a `dot` variant (colored dot, full chip as its
  existing hover card) for evidence layers; the full chip stays on writer
  lines.
- `ReturnPill` — floating pill on the `.back-to-top` plane. Any
  thread-originated jump (step link, "open in matched rules") records the
  origin thread; the pill scrolls back and re-flashes the thread head
  (the `use-rule-focus` flash pattern). Ephemeral — never encoded in
  share links.
- `SimVerdictBlock` foot →
  `Full trace: N of M rules matched · build replay, K stops`; both open
  the EXISTING 047 drawers (internals untouched), which render demoted
  below the card, closed by default.

### Navigation & state

- Thread expansion is uncontrolled locally, but the share fragment gains
  `simThread?: string` (the expanded key) beside `simStep`, and jumps
  push fragment updates — browser Back and deep links work (mockup's
  recorded model). Cross-link into the rules drawer reuses
  `use-rule-focus`'s focus/highlight wiring.
- CSS: the `.kv` subgrid system and `.clause-grid` land in `index.css`
  with existing tokens only (stylelint: no raw colors); flash animation
  honors `prefers-reduced-motion` (background swap, no motion).

### Tests

- **unit**: `verdict-threads` — contested-key cascade order (default →
  201 → 458 fixture), append detection (`description`), removed keys,
  flatten-step winner, base-value labeling; share encode/decode round-trip
  with `simThread`.
- **render**: typing in the form must not re-render `VerdictThreads`
  (extends the 032 test).
- **e2e** (prod build via `vite preview`): expand a thread; popover
  open → Esc → focus back on anchor; step jump opens the merge drawer at
  the right stop and shows the pill; pill returns and flashes; deep link
  with `simThread` + `simStep` restores both.
- Persona replay (`persona-test` skill) on the simulator scenarios once
  shipped — success criterion: the contested-field question ("who else
  wrote groupName?") answerable by entry personas.

### Sequencing (one PR each)

1. `verdict-threads.ts` derivation + unit tests (no UI change).
2. Thread ledger UI + `.kv`/`.clause-grid` CSS + drawer demotion
   (replaces the 046 ledger; `verdict-changes.ts` deleted).
3. `RuleEvidenceCard` popover + `ProvenanceChip` dot variant.
4. `ReturnPill` + `simThread` fragment state + jump wiring.
5. e2e suite + persona replay + roadmap status flip.

### Non-goals

- Variant B's rail and C's lenses (B stays a future audit mode; C's
  digest diff inside the merge drawer is a separate shared-fix ticket —
  the popover's mini digest here is independent of it).
- Engine changes (only the `MergedKey.mode` fallback if append detection
  misfires in practice).
- No third disclosure level: thread → popover is level two; the popover's
  "open in matched rules" is navigation, not another fold.
