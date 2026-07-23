# 019 — Persona usability-test replay skill

Milestone: M6 · Status: planned

## Summary

The 2026-07 persona study ([study report](2026-07-persona-ux-study.md)) —
3 real discussion-board problems × entry/advanced/expert personas, each
role-played by an agent driving the live app in a browser — produced the
highest-signal UX feedback this project has had. Make it repeatable: a
committed agent skill that replays the study (or a subset) on demand, so any
UX change can be evaluated against the same benchmark scenarios.

## User story

As a maintainer who just changed the UI, I want to run
`/persona-test simulator` (or all scenarios) and get the same structured
persona reports — first impression, step log, outcome + confidence, friction
points, wishes — so I can see whether the change actually helped the users it
targeted, without hand-writing nine subagent prompts each time.

## Scope

- A skill under `.claude/skills/persona-test/` encoding the proven procedure:
  build + `vite preview` (NOT `vite dev` — see the study's infra notes),
  generate share links for scenario configs with the share codec, spawn
  persona subagents **serially** (one browser), each browser-only with an
  action budget, collect reports, synthesize a comparison against the
  previous run's findings.
- A scenario library file per problem: config, symptom framing per skill
  level (entry framing must avoid Renovate vocabulary), the facts each level
  is allowed to know, and the ground-truth answer for grading (never shown to
  personas).
- The three studied scenarios (renovate discussions #44772, #43936, #44006)
  as the initial library; adding a scenario = adding one file.
- Persona definitions (entry / advanced / expert) as reusable prompt blocks.

## Out of scope

- Fully automated pass/fail scoring — the output is reports for a human;
  grading against ground truth stays a judgment call.
- Running personas in parallel (single shared browser).

## Dependencies

- 007 (share codec for scenario links). Complements, not replaces, 020.
