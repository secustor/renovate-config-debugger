# 016 — Scale framing, badge glossary, page & editor ergonomics

Milestone: M5 · Status: done 2026-07-24

> Implemented as specified. Framing sentences are honest derivations of data
> already computed elsewhere, never re-walks: the preset tree header names
> which top-level `extends` entry a resolved count came from (`stats.descResolved`
> per root child, naming the dominant contributor only when it's a clear
> majority); the effective config's `packageRules` row and the simulator
> heading share one `rule-framing.tsx` helper built on 013's
> `computeRuleProvenance`, falling back to the bare count — never a guess —
> when attribution is unavailable. Every named badge — options/rules
> contributed, duplicate count, nested, source kind, collapsed-subtree
> rollups — and the counter strip now use the glossary's `Explained` render-prop instead of a
> plain `title`, with grammatically-correct singular/plural counts (was
> unconditionally "N duplicates"); the header stat is relabeled "repeat
> occurrences" with a hover card that explicitly reconciles it against the
> per-row `duplicate ×N` badge's different (inclusive) count. The `overridden`
> badge on effective-config keys is now computed from the actual merge
> actions of its contributing layers (`overwrite`/`forced` → `overridden`;
> `shallow-merge`/`deep-merge` → `merged`; otherwise — critically, `set` then
> `concat`, since the FIRST contributor to any key is always `set`, never
> `concat`, so requiring every contributor to be `concat` never matched —
> `appended`), fixing exactly the misleading case the expert persona called
> out. `End`/`Home` investigation found the actual cause: several cards
> (preset tree, preset detail panel, effective-config key list) nest their
> own fixed-height `overflow: auto` scroll box full of focusable buttons, and
> browsers scroll the nearest scrollable ANCESTOR of the focused element on
> Home/End — not the page — so after clicking anything inside one of those
> boxes, Home/End silently scrolled that small box instead. Fixed by making
> the document the effective scroll target for Home/End regardless of focus
> (skipped for real text-editing contexts and modified key combos), verified
> by dispatching the keys with focus forced inside the preset tree. Chose a
> back-to-top button (simpler, more robust) over a sticky mini-bar. Scroll
> preservation across re-simulation: re-running Simulate resets `showAll` to
> the matched-only default, which can unmount rows above the viewport and
> trigger the browser's scroll-anchoring to jump the page — fixed by
> capturing `window.scrollY` right before the state update and restoring it
> in a `useLayoutEffect` once the new results have painted (the browser
> naturally clamps the restore to the new, possibly shorter, max scroll).
> Editor safety: an undo/redo hint (CodeMirror's bundled history already
> handles the keys; this only surfaces it) plus a "revert to loaded config"
> button, disabled when unchanged. Investigation surfaced a real, if narrow,
> library bug along the way: `@uiw/react-codemirror`'s prop→doc sync defers
> to an internal ~200ms "typing latch" that can be starved by browser
> background-tab timer throttling long enough that a programmatic content
> load right after a fast edit updates React state (and everything
> downstream, e.g. Run) correctly while the visible editor silently keeps
> showing the stale text. Fixed — for revert and every other authoritative
> load (example/share-link/repo-fetch/applied-fix) alike — by remounting the
> `ConfigEditor` (a bumped `key`) on every such load, which always
> initializes fresh from `value` and sidesteps the debounce entirely.

## Summary

Cross-cutting legibility items from the persona study. Big numbers appear
without framing ("Resolved 1076 preset(s)", "packageRules [ 714 items ]") and
read as "did I break something?" to newcomers whose config is 10 lines. Badge
vocabulary (`2 opts`, `duplicate ×2`, `nested`, `internal`, `overridden`) has
no inline explanation — and `overridden` on an _appended_ array like
`packageRules` is actively misleading. Long pages fight the user: `End` lands
on a blank over-scrolled viewport, there's no back-to-top, re-simulating
resets scroll position, and in-editor edits are hazardous (stale-coordinate
clicks silently replace the wrong line; no visible undo affordance).

## User story

As a user with a small config, I want every large number to carry its origin
("713 rules — 2 from your config, 711 pulled in by `config:recommended`"),
every badge to explain itself on hover like the stage pills already do, and
the page to stay navigable while I bounce between editor, results and
verdicts.

## Scope

- Framing phrase wherever a large count first appears (preset tree header,
  effective config `packageRules` row, simulator heading).
- Hover cards for tree/row badges, reusing the glossary card mechanism from
  the first-load UX pass; reconcile inconsistent counts (712 vs 713 vs 714,
  "1 duplicates" vs "duplicate ×2").
- Replace/augment `overridden` on concatenated arrays with an accurate badge
  (e.g. `appended`).
- Keyboard + scroll: End/Home work; sticky mini-bar (stage pills + Run) or a
  back-to-top affordance; preserve scroll position across re-simulations.
- Editor safety: visible undo/redo hint and a "revert to loaded config"
  button.

## Out of scope

- Simulator results filtering (012) and rule provenance (013).

## Dependencies

- 011 (tree summary header), the first-load UX pass (glossary cards).
