# 019 — Persona usability-test replay skill

Milestone: M6 · Status: done 2026-07-24

> Implemented as a Claude Code agent skill at `.claude/skills/persona-test/`.
> **`SKILL.md`** encodes the full procedure: parse an optional scenario
> filter (`all` default, discussion id, or filename fragment) and persona
> filter (`entry`/`advanced`/`expert`, default all three); build the app and
> serve it with `vite preview` (never `vite dev` — the study's documented
> cold-start wedge); verify the server responds before spawning anyone;
> generate one fresh share link per (scenario, persona) pair with the
> bundled generator; spawn persona subagents **serially** against one shared
> browser, browser-only, ~30-action budget, ground truth never given; collect
> each structured report (first impression / step log / outcome + confidence
> / friction points / wishes); synthesize a per-scenario outcome table,
> friction points ranked by frequency, and an explicit comparison against
> the 2026-07 study's baseline findings — including a built-in regression
> check: the `44006-automerge-nesting` scenario is written to also verify
> whether roadmap 012's update-type flattening now lets an expert persona
> complete the "minor ⇒ automerge true" contrast the original study found
> impossible. **`personas.md`** holds the three reusable prompt blocks
> (role / what they know / what they must never be told / report structure)
> plus a shared mechanics footer (browser-only, action budget, never accept
> ground truth). **`scenarios/`** holds the three studied discussions
> (44772 monorepo:react, 43936 star-exclusion validator, 44006 automerge
> nesting), each reconstructed from the study report into a full
> `renovate.json`, three-level symptom framing (entry framing deliberately
> avoids Renovate vocabulary), a per-level "facts allowed" list, and a
> ground-truth section explicitly marked never-shown-to-personas; plus a
> `README.md` template for adding new scenarios (one file = one scenario, no
> registration step). **`generate-links.mjs`** is a dependency-free Node
> script producing the exact `share.ts` wire format (`{v:2, renovate,
config, fileName}` → JSON → UTF-8 → deflate-raw → base64url, no padding)
> via Node's global `CompressionStream`/`DecompressionStream`; it reads the
> pinned Renovate version straight from `packages/engine/package.json`,
> self-verifies every token by inflating it back before printing a URL, and
> supports `--list`/`--help`/plain-JSON or scenario-`.md` input. Verified by
> an independent round-trip decode outside the script (matches the on-disk
> scenario config byte-for-byte). Out of scope per spec: automated
> pass/fail scoring (synthesis stays a human judgment call) and parallel
> personas (one shared browser, serial only).

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
