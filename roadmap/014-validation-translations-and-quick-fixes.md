# 014 — Validation error translations + suggested fixes

Milestone: M5 · Status: planned

## Summary

The app reproduces Renovate's validator messages verbatim — authentic, but
raw. In the persona study, the real-world message _"Your input contains \* or
\*\* along with other patterns. Please remove them, as \* or \*\* matches all
patterns"_ left even the advanced user unsure what "them" refers to. The
advanced persona then spent ~10 minutes manually proving the fix was
behavior-preserving — a proof the tool has all the pieces to run itself.

## User story

As a user whose config was flagged, I want the error translated into plain
words with a concrete suggested edit — "`*` is redundant next to `!gradle`
and newer Renovate rejects it. Change `["*", "!gradle"]` → `["!gradle"]`
(same behavior)" — and ideally a one-click way to apply it and see the
before/after proof.

## Scope

- A small curated library of known validator-error patterns → plain-language
  explanation + suggested edit. Start with the messages that recur on the
  discussion board (redundant `*`/`**`, deprecated option names the migrate
  stage already handles, misplaced global-only options — 008 already surfaces
  the boundary warning).
- Render the translation alongside (never instead of) Renovate's original
  message.
- "Apply fix" writes the edit into the editor and re-runs; the validate stage
  flipping 1 error → 0 errors is the confirmation signal personas already
  found compelling.
- Unmatched errors fall back to today's behavior, plus a docs link when the
  message names an option (003's option index has the URL).

## Out of scope

- Automatic behavioral-equivalence proof via A/B simulation (018 stretch).
- Translating every possible validator message; this is a curated list.

## Dependencies

- 001 (validate stage), 003 (option docs/urls).
