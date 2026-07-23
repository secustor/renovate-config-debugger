# 018 — Evidence export + expert-grade precision

Milestone: M6 · Status: planned

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
