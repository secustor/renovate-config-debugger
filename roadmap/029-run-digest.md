# 029 — Run digest (plain-English overview)

Milestone: M8 · Status: done

> Implemented as specified. `packages/app/src/run-digest.ts` is a pure,
> DOM-free generator: `DigestInput` (the run's already-derived stats) → an
> ordered `DigestClause[]` of `{ id, tone, text, link?, tail }`, where a clause
> is prose with at most ONE linked fragment and carries its own punctuation, so
> the clauses concatenate into a flowing paragraph rather than a bullet list
> (`digestText` renders exactly what the Overview reads as, minus the links —
> which is what the unit tests snapshot). Branches: fatal parse error
> short-circuits to a single clause; validation errors open with 023's "a real
> Renovate run would refuse this config" framing and then narrate the
> hypothetical run; non-validation errors say the run did not complete cleanly;
> otherwise "✓ Renovate accepted this config". Rewrites are named at ≤2 and
> counted above that; the preset clause switches to the "only N of which set
> options, the rest are package-grouping rules" framing above a threshold
> (50 resolved presets, never a hardcoded count), with separate clauses for
> failed fetches and user-supplied injections; the effective clause quotes the
> option and overridden counts; an active 008 layer stack gets a clause; a tail
> clause counts the problems and summarizes the first one. Every number is
> passed in, never recomputed: `presetTreeSummary` (one walk, the Presets
> badge's own number) and `EffectiveConfig`'s `onStats` (which now reports the
> overridden count alongside the key count) feed the badges and the digest from
> the same derivation. The "sets options" split needed one new derivation —
> counting presets by whether they set a REAL option, excluding `description`/
> `$schema` and pure matcher/grouping keys; without that, `config:recommended`
> reads as "469 of 1,076 set options" (every `monorepo:*` preset is matchers
> only) and the framing would be false. It now reads: "✓ Renovate accepted this
> config. It rewrote `semanticCommits` and `stabilityDays` in your file. Your
> `config:recommended` and `:dependencyDashboard` entries expanded into 1,076
> presets — only 7 of which set options, the rest are package-grouping rules.
> Everything merged into 10 effective options, 1 of them overridden along the
> way." Clause prose marks names with backticks and the renderer turns those
> into `<code>` spans, keeping the generator plain text. Tested by a new vitest
> unit suite in the app package (`test:unit`, pure modules only — no jsdom),
> plus an extended 028 e2e case. The 023 hypothetical banner still renders
> above the digest on the Overview, so a refused run states the refusal twice
> (boxed alert, then prose) — kept deliberately: the banner is 023's contract
> on post-Validate results and the digest's framing must not contradict it.

## Summary

The content of 028's Overview tab: the whole run narrated as two or three
sentences, where every number is a link into the corresponding tab —

> ✓ Renovate accepted this config. It [rewrote 2 deprecated options] in
> your file, expanded `config:recommended` and `:dependencyDashboard` into
> [1,076 presets] — only 14 of which set options, the rest are
> package-grouping rules — and merged everything into [23 effective
> options], 6 of them [overridden along the way]. **1 warning:** your
> `schedule` may never match — [review it].

Instead of showing panels and letting the user work out what happened, the
app tells them what happened (crontab.guru's pattern: the entire result is
one English sentence first). Split out of 028 deliberately: the sentence
generator is a real feature with ~15–20 conditional branches, and its
quality decides whether the Overview reads as insight or as boilerplate —
it needs its own design and test attention, and 028 must not block on it.

## User story

As a first-time user, I read one paragraph and know whether my config is
OK, what Renovate silently changed, what my `extends` actually cost, and
what needs my attention — before I've learned what any tab means.

## Scope

- A **pure generator module** in the app: `TraceResult` (+ provenance/tree
  stats already computed for 005/011) → an ordered clause model
  `{ text, linkTarget?, tone }`, rendered by the Overview tab as prose with
  inline tab links. No free-form templating in the component.
- **Clauses degrade gracefully** across run shapes, at minimum:
  - fatal parse error ("Renovate could not read this config — …");
  - validation errors ("a real Renovate run would refuse this config",
    consistent with the 023 hypothetical-results framing) vs. warnings vs.
    clean;
  - 0 migrations (clause omitted) / n migrations (name the options when ≤2);
  - preset expansion: none (`extends` absent), small (plain "expanded 3
    presets"), huge (the "only 14 set options, the rest are grouping rules"
    framing — thresholds, not hardcoded 1,076), failed fetches ("2 presets
    could not be fetched — provide them or add a token"), user-supplied
    injections noted;
  - effective config: options count + overridden count (from 005's
    provenance, so the numbers match that tab exactly);
  - global/inherited layers active (008) — mention the layer stack when
    present.
- **Numbers come from one source**: the same derived stats that feed 028's
  tab badges, so digest and badges can never disagree.
- **Tests per branch**: unit tests over the clause model using the existing
  golden/trace fixtures plus synthetic edge fixtures (error run, empty
  config, no-extends config, failed-fetch run). Snapshot the full digest
  text for the canonical fixtures.

## Out of scope

- Generated/LLM prose, localization — hand-written English clauses only.
- New engine instrumentation; everything derives from the existing trace.

## Dependencies

- 028 (the Overview tab it fills), 005 (overridden-count provenance), 011
  (tree stats), 023 (hypothetical framing consistency).
