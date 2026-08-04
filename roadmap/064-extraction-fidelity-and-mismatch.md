# 064 — Extraction fidelity: the RE2 gap, and comments that matched nothing

Milestone: M17 · Status: proposed — deferred; depends on **063**.
Renumbered from 058 (2026-08-05); main took 056–061. Evidence:
[2026-08-custom-manager-simulation-feasibility.md](2026-08-custom-manager-simulation-feasibility.md) §3

## Summary

063 shows what Renovate would extract. This item makes that claim honest, and
then answers the question #45071 actually asked.

Two things stand between "the app extracted this" and "Renovate will extract
this". First, production Renovate compiles `matchStrings` with **RE2**; the
browser falls back to native `RegExp`, and the two languages differ in both
directions — including two constructs that diverge **silently**, with no error
from either engine. Second, a manager that extracts nothing from a file is
reported as "no dependencies", which is exactly what a working manager on an
unrelated file also reports; the user cannot tell "nothing to find" from "your
regex is wrong", which is the whole complaint.

## User story

As someone whose custom manager found nothing, I want to be told whether my
pattern is even valid in real Renovate and which of my `# renovate:` comments
were ignored, so that a clean result means "correct" rather than "silent".

## Scope

### Fidelity — RE2 as an oracle

- Add `re2js` (pure-JS RE2 port, no WASM, ~60 KB gzipped), **lazily imported**
  so it stays off the critical path (031) and loads only when a config actually
  declares custom managers.
- Compile every `matchString` with it **beside** native `RegExp`, and report
  the disagreement:
  - RE2 rejects, JS accepts (lookahead, lookbehind, backrefs) → "Renovate would
    fail validation on this pattern" — the dangerous direction, where the app
    would otherwise show a confident, wrong preview;
  - RE2 accepts, JS rejects (`(?i)`-style global inline flags) → "valid in
    Renovate, cannot be previewed in a browser" — an honest limitation, not the
    bogus syntax error the app would otherwise show;
  - both accept but the **match spans differ** (`[[:alpha:]]`, `\p{…}` without
    `u`) → warn from the observed difference.
- Surface it as a per-pattern state in the `Extraction` tab, not a global
  banner: one bad `matchString` among four should mark that one.

### Mismatch — the `warnOnMismatch` question

- A probe pattern (default `#\s*renovate:`, editable) is matched against each
  file; any hit falling **outside** every extracted span is flagged as a comment
  that looks intended for a manager and was ignored.
- Distinguish the two silent outcomes already available from 063's trace: never
  matched at all, versus matched and then **discarded** by
  `checkIsValidDependency` (missing `datasource`, or no `currentValue` /
  `currentDigest`) — the second names the missing field.

## Decisions

- **`re2js` is an oracle, not the engine.** Extraction keeps running upstream's
  own code path so results stay attributable to Renovate's functions. Swapping
  `re2js` in via the `expose.ts` `re2()` slot would be higher fidelity but
  materially more work — it is not RegExp-API-compatible, so the shim would owe
  `exec` with `lastIndex` advancement, `test`, and the well-known symbols
  (`Symbol.replace`/`Symbol.match`) that Renovate uses through
  `String.replace(regEx(…), …)`, each unimplemented one a silent break. Revisit
  only if the oracle proves insufficient in practice.
- **Not a static lint.** Two of the divergences compile cleanly in both engines
  and merely match different things; no pattern inspection can see that. Running
  both engines over the real sample file can, and it costs nothing extra once
  `re2js` is loaded.
- **Native `RegExp` cannot be configured into RE2 mode.** V8 does ship an
  RE2-style linear-time engine behind an `l` flag that rejects exactly the
  non-regular constructs, but it requires `--enable-experimental-regexp-engine`
  at V8 startup, is not exposed to web content, and has no Firefox or Safari
  equivalent — and it would still only cover one of the two directions.
  Measured, not assumed; see the feasibility note.
- **The gap is an edge case, and the framing should say so.** All 60
  `matchStrings` in Renovate's own bundled `custom-managers` presets use named
  groups and nothing else. Warnings must not imply the common case is unsafe.
  Precedent for a named, documented gap: `conda` versioning.
- **The probe pattern is editable, and its default is a guess.** `#\s*renovate:`
  fits comment-style managers and misses others; presenting it as authoritative
  would trade one silent failure for another.

## Verification

- Pure unit tests for the oracle's verdicts, one per row of the divergence
  table in the feasibility note (§3.1) — including the two silent cases, which
  assert on differing match spans rather than on compilation.
- A test that the whole `re2js` import is absent from the entry chunk.
- Mismatch detection tested on the #45071 fixture from 063: the typo'd comment
  is flagged, the correct one is not.
