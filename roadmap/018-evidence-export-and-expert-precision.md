# 018 — Evidence export + expert-grade precision

Milestone: M6 · Status: done 2026-07-24

> Implemented as specified across the engine and app. **Share links + auto-run:**
> the versioned share payload gains one optional additive field, `sim`
> (`{ form, autoSimulate? }`, form = the simulator's dependency-descriptor
> fields, never tokens), with NO version bump — a pre-018 v2 consumer ignores
> the unknown key and the decoder tolerates its absence; `decodeShare`
> sanitizes it to string→string form entries only. A "Copy link with this
> simulation" button by the verdict block encodes the current form (with the
> EFFECTIVE updateType, so the opener reproduces the exact verdict) and sets
> `autoSimulate`. `App.loadShareToken` now `await`s the pipeline run and only
> then arms a nonced `simRequest`, so the `RuleSimulator` applies the form and
> auto-runs against the freshly-run config — identically on mount and on
> hashchange (017's path), verified in a production `vite preview`. **Copy as
> markdown:** a reusable `CopyMarkdownButton` (fenced block + one-line header,
> `navigator.clipboard.writeText`) on the preset inspector's Fetched/Fully-
> resolved bodies and on each matched rule's applied-diff panel (header =
> `packageRules[N] <selectors> — <verdict>`, body = `key: before → after`
> lines). **A/B runs:** "Pin result for comparison" on the verdict block keeps
> an A result across pipeline re-runs; editing + re-simulating renders a
> structured diff — matched-rule set delta (only-A / only-B / both, paired by a
> selector signature stable across index shifts) and final per-dependency
> config key delta — with an explicit "No behavioral change" verdict when both
> are equal. The comparison is a pure engine module,
> `simulate-compare.ts` (`compareSimulations`, type-only import of
> `SimulationResult`, zero Renovate deps), unit-tested in
> `test/simulate-compare.node.test.ts` (noChange, only-A/only-B/both split,
> key-level deltas with presence flags, multiset pairing). **Matcher
> precision:** clause evaluation now distinguishes a matcher's `false` with the
> read field present (`no-match` — a real mismatch) from `false` with none of
> the read fields set (`no-input` — upstream's fail-closed `if (!sourceUrl)
return false`, reported "skipped — no sourceUrl set on the simulated
> dependency", naming the field), and renames the `null` case `not-applicable`
> ("skipped, doesn't affect the rule"). `no-input` still fails the rule
> (verdict + "failed on <clause>" unchanged) so the oracle is untouched — only
> the reporting sharpened; engine tests updated.

Original plan below.

---

## Summary

The expert personas judged the tool "citable with caveats" for
discussion-board answers. What's missing to make it a self-contained
authority: exportable evidence, reproducible simulator links, comparable
runs, and matcher verdicts as precise as the code
(`false` fail-closed vs `null` not-applicable both render as "no match";
"no match against no input value set" is also mangled English).

## User story

As an experienced user answering someone's config question, I want to hand
back one link that reproduces my exact demonstration — simulator inputs
included — plus copy-paste-ready evidence (a preset's resolved body, a
rule's applied diff), and an explicit "no behavioral change" verdict when I
compare a fix against the original.

## Scope

- Share links optionally encode simulator inputs; opening one lands with the
  form pre-filled and (explicit flag) auto-simulated.
- Copy-as-markdown on the preset inspector (fetched/resolved body) and on a
  rule's applied-diff panel.
- A/B runs: pin a simulation result, edit the config, re-simulate, get a
  structured diff of matched-rule set + final per-dependency config, with an
  explicit "no behavioral change" verdict when equal (pairs with 014's
  suggested fixes).
- Matcher verdict precision: distinguish "returned false (input present,
  no match)" from "returned null (not applicable, skipped)" in the clause
  rows, and fix the "no input value set" phrasing to name the missing field.

## Out of scope

- Diffing a preset across Renovate versions (would need multiple pinned
  renovate builds — revisit as its own item if demand shows up).

## Dependencies

- 006, 007, 012 (verdict block is where A/B output renders), 014.
