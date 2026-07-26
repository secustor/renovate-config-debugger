# 046 — Simulator: verdict card + merge timeline

Milestone: M12 · Status: done (2026-07-26)

Mockups (approved 2026-07-26): the content decisions in
[mockups/046/simulator-flatten-noise.html](mockups/046/simulator-flatten-noise.html)
(variants 1B + 2A) and the visual redesign in
[mockups/046/simulator-redesign.html](mockups/046/simulator-redesign.html)
(section 2 settled on variant 2B, the Pipeline chip grammar).

## Summary

A 2026-07-26 review of the 044 stepper surfaced two defects. First, the
verdict block's changed-keys list diffed the pre-rules effective config
against the post-flatten per-dependency config, so the seven update-type
blocks Renovate's `flattenUpdates` always deletes (`major`, `minor`,
`patch`, `pin`, `digest`, `lockFileMaintenance`, `replacement`) showed as
"removed" on every simulation — no rule removed them, and the noise
buried the real changes. Second, the "Final per-dependency config"
section claimed those keys as "Rules changed" while its own stepper
opened with "this rule changed nothing — No differences", and the
heading promised a config that was actually hidden behind a disclosure.

## Scope

- **Flatten-noise fix (mock 1B).** `changedKeys` deletes the update-type
  blocks from its base copy before diffing — only genuine rule changes
  (and real update-type merge-ups, which land top-level) survive. The
  app-local `UPDATE_TYPE_KEYS` copy is typed against the engine's export
  (added for this purpose), the same drift-fails-the-build pattern as
  033's `STAGE_IDS`. When blocks were consumed without merging anything
  up, a muted aside on the verdict card names them and why (`updateType`
  unset, or nothing the update's own block changed), linking to the
  flatten stop.
- **Verdict card.** `SimVerdictBlock` became a three-part card: an
  answer band (mono eyebrow naming the simulated update, the sentence
  one size up with the modal verbs — WOULD / WOULD NOT — as tinted
  badges via `buildVerdictSegments`), a ledger of the changed settings
  (value, owning layer's provenance chip, "step N of M →" jump into the
  merge timeline), and a footer with the rule-list jump and the 018
  evidence-export affordances.
- **Merge timeline (mock 2B).** The 044 stepper's hidden sequence became
  an always-visible chip row on the app's ONE clickable-sequence
  grammar: `SequenceTimeline`/`SequenceSep`/`SequenceChip`, a new common
  base extracted from the 024/042 stage timeline (same
  `.stage-timeline`/`.stage-chip`/`.stage-sep` CSS and DOM;
  `StageTimeline` is now a thin adapter over it). Stops: base → each
  matching rule → update-type flattening → the final config. The 024 dot
  meanings carry over — green circle = matched but changed nothing,
  amber diamond = changed things (delta in the count slot: `±0`, `+2`,
  `⊘7`), hollow ring = the base — so "4 rules matched, 4 settings
  changed" is readable off the geometry and can no longer contradict
  the summary line.
- **Detail panel.** Still `StepThrough` + `JsonDiff`, extended: per-step
  `counter` ("Start" / "Step N of M" / "After the rules" / "Result"),
  per-step `body` for the non-diff stops, a `cumulativeLabel` ("Diff
  vs. base config"), and `benignRemovals` — the 026 `$schema`
  benign-note pattern parameterized, so the flatten stop's red block
  removals carry "consumed by flattening … not a rejection" instead of
  reading as errors. The flatten stop now renders even when nothing
  merged up (diff derived by deleting the blocks, exactly upstream's
  behavior); the terminal stop replaces the old "show the full resolved
  dependency config" disclosure (which remains as the fallback when no
  rule matched).
- **Index semantics.** `mergeStepIndex` (App-owned, share-restored via
  `simStep`) now counts timeline stops, base = 0 — a pre-046 share
  link's `simStep` lands one stop early rather than breaking.

## Non-goals

- Engine semantics: `simulatePackageRules` and its oracle-parity fields
  are untouched (the only engine change is exporting the existing
  `UPDATE_TYPE_KEYS` constant).
- The pinned A/B comparison (018) — it diffs two final configs, both
  already flattened, and needed no change.
