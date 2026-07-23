# 014 — Validation error translations + suggested fixes

Milestone: M5 · Status: done 2026-07-24

> Implemented as specified, scoped to three curated patterns (redundant
> `*`/`**`, deprecated options the migrate stage doesn't auto-rename, 008's
> global-only boundary warning) plus a docs-link fallback for anything else —
> a change to Renovate's own message wording simply stops a pattern matching
> rather than mis-firing. `packages/engine/src/error-translations.ts` matches
> `ValidationMessage`s and computes a structured `ErrorFixResult` (a JSON path
> plus before/after values, and also the fully fixed config, satisfying both
> the "function from parsed config to fixed config" the spec asked for and a
> surgical text-patch target) against the EXACT config snapshot
> `validateConfig("repo", …)` ran on (the pipeline's post-massage,
> pre-preset-merge trace snapshot). Renovate's own message already embeds the
> offending path (`packageRules[1].matchPackageNames: …`), so locating "the
> one array" is exact, not a search. Conservative by construction: a fix is
> only returned when the path resolves in that exact config and the edit is
> unambiguous (nothing to remove, an already-taken rename target, more than
> one candidate replacement named, etc. all decline rather than guess). Both
> this module and its text-patch counterpart
> (`packages/engine/src/error-fix-text.ts`) live in the ENGINE rather than the
> app: the app package has no test setup, and both are pure (no DOM, no
> renovate/dist imports; option-name lookups go through `option-docs.ts`'s
> re-export), so this is where they could actually be unit-tested. `run.ts`
> loads them through the same lazy dynamic import as the option index so the
> heavy engine chunk stays out of the initial bundle (verified: the pattern
> text is absent from the main chunk, present only in the lazily-loaded one).
> `error-fix-text.ts` applies a fix as a surgical text splice (bracket-depth
> scan in the spirit of 013's `rule-locate.ts`, not a full JSON5 parser: it
> recognizes double-quoted keys and `//`/`/* */` comments, the overwhelming
> convention), so everything about the document except the fixed value —
> comments, formatting, key order — survives. When a path segment can't be
> located (e.g. a single-quoted key, or the config was hand-edited since the
> message was produced) it falls back to re-serializing `fixedConfig` for the
> whole document instead, flagged `surgical: false` so the app can warn that
> formatting/comments were lost: a documented tradeoff, not a silent partial
> edit. UI: a new `ErrorTranslationView` renders under every message in both
> `MessagesPanel` (the top-level `validate` errors/warnings, where "Apply fix"
> is offered, since these index the repo's own editor text) and
> `RuleSimulator`'s validation echo (explanation + docs link only — that echo
> validates the merged/simulated `packageRules`, not the editor's text, so
> there's no safe surgical target there; the same issue in the user's own rule
> also surfaces with a fix in the main panel). "Apply fix" writes the patched
> text into the editor and re-runs immediately, without waiting on the
> `content` state commit — the validate stage flipping error to ok is the
> confirmation. Unmatched messages get `findMentionedOption`'s docs-link
> fallback (quoted-token scan against 003's option index) instead of a
> translation card. 013's `packageRules[i]` cross-links are unaffected: the
> translation renders as an additional block below `RuleMessage`, never
> replacing it.

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
