# 029 — Run digest (plain-English overview)

Milestone: M8 · Status: planned

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
