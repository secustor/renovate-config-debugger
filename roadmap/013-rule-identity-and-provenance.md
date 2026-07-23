# 013 — Rule identity: one numbering, provenance chips, cross-links

Milestone: M5 · Status: planned

## Summary

The same packageRule appears under three unrelated numbers: validation says
`packageRules[1]` (repo-config index), the simulator's validation echo says
`packageRules[713]` (post-preset-merge index), and the results list says
`#714` (1-based row). Nothing connects them, and nothing marks which rules
came from the user's own config versus a preset. Every skill level in the
persona study stumbled on this; the expert called it the thing "a
non-maintainer will think are two different errors."

## User story

As a user reading a validation error or a simulator result, I want to click
`packageRules[1]` and land on that rule — in my editor and in the merged rule
list — and I want my own rules visually distinct from the 711 rules
`config:recommended` injected, so "where is MY rule?" is never a scroll hunt.

## Scope

- One canonical rule presentation; wherever another indexing scheme must
  appear (upstream validator messages), annotate it: "repo-config index 1 =
  merged rule 713".
- Provenance chip on every simulator rule row and on the effective config's
  `packageRules` entries: `repo config`, `global config`, `inherited config`,
  or the contributing preset's name (the Effective config panel already has
  these chips — reuse them).
- Clickable cross-links: validation error → editor line (repo config) and →
  merged rule row; simulator rule row → contributing preset node in the tree.
- Rule captions list **all** matcher clauses and name the failing one
  (`#7 matchSourceUrls + matchUpdateTypes — failed on matchSourceUrls`);
  today a row captioned with a passing matcher plus "no match" looks broken.

## Out of scope

- Verdict block / matched-only filter (012).
- Fixing upstream validator message indices.

## Dependencies

- 005 (provenance layers), 006, 012 (results-list rework lands first).
