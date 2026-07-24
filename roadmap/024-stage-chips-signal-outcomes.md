# 024 — Stage chips signal what each stage did

Milestone: M7 · Status: done

## Summary

User-reported (2026-07-24): every stage chip shows a green dot as long as it
didn't error — Migrate shows green even when it rewrote the config
(`semanticCommits: true` → `"enabled"`). Green universally reads as
"nothing to see here", so the one stage that _did something to your config_
looks identical to the stages that passed it through untouched.

## User story

As a user scanning the stage row, I want the dots to tell me where my
config was changed or flagged before I click anything: green = passed
through unchanged, amber = this stage transformed the config (with how many
steps/changes), red = errors — so "Migrate rewrote something" is visible at
a glance.

## Scope

- Per-stage activity signal: amber/orange dot when the stage produced a
  non-empty transformation (migrate steps > 0, massage changed the config,
  validation warnings), red retained for errors, green only for
  pass-through/clean.
- A small count on or beside the chip where meaningful ("Migrate ·1").
- Define the semantics per stage explicitly: Presets/Merge always
  "transform" by nature — for those, amber should mean something
  non-routine (e.g. resolution errors already red; consider leaving them
  neutral) rather than being permanently amber. Document the chosen rule in
  the stage explainer hover cards (which already exist per stage).
- Keep the colors legible in both themes and for color-blind users (shape
  or count, not color alone).

## Out of scope

- Reordering stages or changing stage content.

## Dependencies

- 001 (stage timeline), first-load UX pass (stage explainer cards).

## Delivered

- Per-stage activity signal derived entirely from data already on
  `TraceResult` (no engine changes): `stage-activity.ts` computes a
  `clean | changed | error | skipped` level plus an optional count from the
  stage's own trace events — migrate steps counted from `migration-applied`
  events, massage from the stage-complete event's JSON-patch delta length,
  validate warnings/errors from `validation-message` events.
- Explicit per-stage rule: migrate/massage/validate turn amber when they
  produced a non-empty transformation (with a count); parse/global/inherit/
  presets/merge always "transform" by nature (parsing text, assembling a
  layer, resolving extends, merging defaults) so they stay green whenever
  they succeed and only turn red on error — never amber for their routine
  job. Validate shows a count in both its amber (warnings) and red (errors)
  states.
- Each rule is spelled out in that stage's existing hover card
  (`STAGE_EXPLAINERS` in `StageTimeline.tsx`), so "why is this one green and
  that one amber" is one hover away.
- Accessibility: the dot's shape changes with its level (circle / diamond /
  square / hollow ring for clean / changed / error / skipped) so the signal
  survives grayscale and color-blind viewing, not just its color; a
  `·N` count renders beside the chip label, and each chip gets an
  `aria-label` stating the outcome in words (e.g. "Migrate: 1 migration
  applied").

## Deferred

- None.
