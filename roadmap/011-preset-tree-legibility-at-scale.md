# 011 — Preset tree legibility at scale

Milestone: M2 · Status: planned

## Summary

Make huge preset expansions comprehensible. 002 renders the resolution tree
faithfully, but faithfulness alone doesn't survive contact with reality:
`config:recommended` expands transitively to **over 1,000 presets** (the
`group:monorepos` / `group:recommended` subtrees alone pull in many hundreds
of tiny internal packageRules presets). A tree with a thousand
mostly-identical nodes answers no question — the user's actual questions are
"what did all of that *do* to my config?" and "where did this one setting
come from?". This entry is about turning the raw tree into an instrument for
those questions.

## User story

As a user extending `config:recommended`, I run the pipeline and see at a
glance that it resolved to ~1,100 presets, of which 14 actually changed
top-level options and the rest contributed grouping packageRules — without
scrolling through a thousand nodes. When I search for `dockerfile` or for
the option `rangeStrategy`, the tree collapses to just the paths that
matter.

## Scope

- **Progressive disclosure by default**: subtrees collapse to a single
  roll-up node with counts — "`group:monorepos` · 690 presets · 690
  packageRules" — expandable on demand. Auto-collapse heuristics: internal
  presets, subtree size thresholds, and "leaf farms" (a parent whose
  children are all leaves of the same shape).
- **Contribution-based views**, not just structure:
  - badge each node with what it actually contributed (n top-level
    options, n packageRules, nothing = pure `extends` router);
  - a "hide zero-contribution nodes" toggle that shortcuts pure routers
    (`config:recommended` → … → the preset that really set the value)
    while keeping the elided path recoverable on hover/expand.
- **Search and filter**: by preset name/source, by option key a preset
  sets, and by package name/pattern matched in contributed packageRules
  ("which of these 690 presets is about `aws-sdk`?"). Matches prune the
  tree to matching paths with ancestors kept for orientation.
- **Reverse lookup**: from any key in the effective config, jump to the
  preset node(s) that set it (the per-preset complement of 005's per-key
  provenance; shares its trace data).
- **Summary header**: totals (presets resolved, fetched vs internal,
  packageRules contributed, max depth, fetch time) — also the honest
  "this is what `config:recommended` really costs" number the README can
  cite.
- **Flat table view** as an alternative to the tree: one row per resolved
  preset (name, source, contribution counts, dedup count), sortable and
  filterable — often the better instrument at n=1,000.
- **Rendering**: virtualized list/tree so 1,000+ nodes stay smooth;
  expansion state survives re-runs of the same config where node identity
  matches.
- Dedup handling at scale: the 002 dedup indicator becomes a count with
  "show all paths" expansion, so repeated presets don't multiply visual
  bulk.

## Out of scope

- Per-key provenance across merge stages (005) — this links to it, but the
  merge view itself is 005.
- packageRules *evaluation* against real dependencies (006); here we only
  count and search rules, never execute them.
- Any change to resolution semantics or fetching (002/010 own those).

## Dependencies

- 002 (the tree and its trace events are the substrate). Reverse lookup
  shares instrumentation with 005 — build the trace format once.
