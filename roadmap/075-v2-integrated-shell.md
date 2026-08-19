# 075 — v2: the Integrated Shell

Milestone: M20 · Status: in progress

## Summary

v2 rebuilds the app's frame around the "Proposal F — Integrated Shell" design
(claude.ai/design project "Renovate Config Debugger"). The pipeline engine,
derivations and instruments stay; what changes is the shell they live in and
the visual system they share:

- **One window, two panes.** The app becomes a full-viewport working surface:
  editor pane left, instruments pane right, each scrolling independently.
  The page itself never scrolls.
- **The header carries the run's digest.** A compact identity row (26px logo,
  title), the run's verdict as a status pill (`accepted` / errors), and the
  digest as jump-links — `1 rewrite · 1,102 presets · 62 effective options ·
0 problems` — each opening the instrument that explains it. Renovate
  version and the account menu (066) sit right.
- **Tests first.** The simulator is recast as _dependency tests_: pinned
  descriptors that are re-checked against the rules on every Run, listed as
  the first tab with per-test matched/failed rules and skipped-rule buckets.
- **Rewrites fold into Pipeline.** The migrate stage of the pipeline rail
  shows the rewrite diff in place; the separate Rewrites tab retires.
- **Overview retires.** Its digest lives in the header; its links become the
  header's jump-links.

Tab model: `Tests · Pipeline · Presets · Effective config · Problems`.

## The component standard ("Standard Components" sheet)

The design derives its palette from the app's existing `:root` tokens, so v2
is not a re-skin — it is a consolidation. One implementation per role, used
everywhere:

- **Pill** — 999px radius, 0.7rem, `0/0.45rem` padding, line-height 1.4,
  tinted 0.1-alpha fill + 0.32-alpha border. Semantic tones (repo/accent,
  preset/purple, ok, warn, error) are weight 600; neutral counts are 400 with
  a plain border.
- **Buttons** — ONE primary (accent fill, 600, 6px radius, `0.25/0.7rem`
  padding, label + optional `kbd` shortcut pill; disabled = `--accent`-tinted
  fill + not-allowed while a blocking panel is open). Secondary = same
  metrics, outline; active state = accent border + canvas fill. Quiet =
  link-blue underline for cross-navigation, bare × for dismissal; textual
  Cancel is always secondary.
- **Segmented control** — mutually exclusive views; selected half wears the
  secondary button's active state.
- **Summary strip** — first element of every tab: the tab's whole story in
  one sentence on a `--surface` strip (8px radius, `0.45/0.7rem` padding,
  key numbers in 600 ink), optional quiet action pinned right.
- **Preset token** — every preset reference wears the same purple mono token
  (0.08-alpha purple fill, 4px radius), whether static text or a link to the
  preset's node.
- **Attached tabs** — the active tab is a white card connected to the body
  (`6px 6px 0 0`, −1px bottom margin) on a `--surface` rail; counts as pills,
  accent-tinted when the tab has content, neutral at zero.

## Iterations

Each iteration lands green (lint, typecheck, unit + render tests) and is a
commit on `feat/v2`:

1. **Standard components** — the shared primitives above as CSS classes +
   small components; adopt them where today's ad-hoc copies drifted.
2. **Shell** — full-viewport two-pane layout; compact header with status
   pill + digest jump-links; editor toolbar (filename · Load from repo ·
   Run); repo-load as an overlay over the editor pane; "everything runs in
   your browser" footer strip.
3. **Tab model** — Tests first (simulator renamed and re-anchored), Rewrites
   folded into Pipeline, Overview retired; share-link tab ids migrated.
4. **Pipeline rail** — stage nodes with status glyphs (∅ skipped, ● clean,
   ◆ changed) + per-stage deltas; migrate shows the rewrite diff inline.
5. **Instrument restyles** — Presets ledger summary, Effective config
   grouped by decider layer (repo / presets / defaults) with cascade stacks,
   Problems as fix-it cards; all led by summary strips.
6. **Pinned tests** — multiple pinned descriptors, re-simulated per run,
   carried in share links. The full simulator stays: it is the Tests tab's
   second view (the ledger/tree split, again), reached from a pin's "open in
   simulator →" or the list's own link, and opened automatically by anything
   that names a simulation (a link's `sim`) or a rule (a cross-link's index).

## Non-goals

- No engine or CLI changes; the trace and derivations are already what the
  design renders.
- No palette change: the design's light/dark values are the app's existing
  tokens.
- The advanced zone (008/045 layers, host tokens) keeps its behavior; it
  moves with the editor pane.
- **No seeded pins.** The Landing Transition mock shows a Tests tab that
  already has pins in it; iteration 6 deliberately ships an empty list with an
  explainer instead. A pin the user did not ask for is a test they did not
  write, and every run would then re-check a descriptor they never chose —
  magic, and wrong by default. The ghost row is the offer.
- **No expectation model.** A pin records a descriptor, not an assertion about
  its outcome, so a card's dot is green for any verdict the tool is confident
  about and amber only when it may not be the truth (a failed simulation, or
  the replay-02 caveat that one of the reader's own rules lost to an unset
  field). "This pin should automerge, tell me when it stops" is a later idea
  that this model leaves room for.
