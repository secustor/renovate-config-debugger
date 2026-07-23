# 013 — Rule identity: one numbering, provenance chips, cross-links

Milestone: M5 · Status: done 2026-07-24

> Implemented as specified. Engine: `computeRuleProvenance` (013) attributes
> every entry of the merged `finalConfig.packageRules` to its contributing
> layer (repo / global / inherited / preset) and the index within that
> layer's OWN `packageRules` array — the repo-config index a validator
> message like `packageRules[1]` names. It needs no merge replay: since
> `packageRules` only concatenates and `mergeChildConfig` concatenates arrays
> associatively in encounter order, reading each layer's own array length off
> the same ordered layer list `computeProvenance` (005) already builds gives
> the exact contiguous slice of the final array each layer contributed;
> returns `undefined` (not a guess) when the replayed lengths don't add up to
> the ground-truth array. UI: the simulator's rule rows now read
> `packageRules[N]` (0-based) instead of a separate `#N+1` row count — the
> same text a validator message uses — with a provenance chip reusing the
> effective config's exact chip component (extracted to `ProvenanceChip.tsx`);
> the same chip + per-rule list now also appears under the effective config's
> `packageRules` entry. Rule captions list every `match*`/`exclude*` clause
> and name the one that decided a no-match verdict. Validation messages
> (`packageRules[N]`) are rendered through a shared `RuleMessage` component
> that makes the index a clickable jump (repo-config messages → the editor
> line, via a lightweight bracket-depth scan of the raw text, no full JSON5
> parser; merged-index messages, e.g. the simulator's own validateConfig echo,
> → the rule row) and appends the other index as a second link when the
> mapping is determinable ("repo-config index 1" / "merged rule
> packageRules[713]"). A simulator rule row's provenance chip reuses the
> existing preset-tree selection wiring (`onSelectPreset`/`selectedId`) rather
> than new plumbing. All cross-links use `scrollIntoView` + a transient
> `rcv-flash` CSS class; the editor jump uses CodeMirror's own
> transaction/selection API (no new dependency — `@uiw/react-codemirror`
> re-exports `EditorView`). Known gap: the editor-line locator only recognizes
> a double-quoted top-level `packageRules` key (the overwhelming convention,
> including in `.json5` files); an unquoted or single-quoted key is not
> recognized and the editor cross-link is silently skipped for that config
> (the simulator/preset-tree cross-links are unaffected).

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
