# 024 — Stage chips signal what each stage did

Milestone: M7 · Status: planned

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
