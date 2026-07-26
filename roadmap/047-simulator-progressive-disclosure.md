# 047 — Simulator: progressive disclosure

Milestone: M12 · Status: done (2026-07-26)

Mockup (approved 2026-07-26, variants 1A + 2A with review revisions:
datasource-first essentials, registry dropdowns→type-to-search, "repo
config" label kept + chip hover, consumed-blocks aside made
conditional):
[mockups/047/simulator-progressive-disclosure.html](mockups/047/simulator-progressive-disclosure.html)

Research basis (commissioned for this work, cited findings):
[2026-07-progressive-disclosure-research.md](2026-07-progressive-disclosure-research.md)

## Summary

Post-046 the Simulator tab showed everything at once: ten form fields
plus a "More fields" tier, then — after Simulate — the verdict card, the
rule list with its filter controls, and the merge timeline with an open
diff panel. 047 stages the tab into three layers matched to the user's
journey — **the ask** (a minimal form), **the answer** (the verdict
card, never folded), **the evidence** (summary drawers, opened on
demand) — following the research's rules: never gate the primary
answer, cap disclosure at two levels, cut fields before hiding them,
and give every collapsed header a computed count/preview so collapsed
never means scentless.

## Scope

- **The ask.** The primary grid is four fields — `datasource`,
  `packageName`, `currentValue`, `newValue`. `datasource` and `manager`
  are type-to-search comboboxes (`<input>` + shared `<datalist>`) fed by
  the pinned renovate's own registries; the engine ships the name lists
  as a GENERATED module (`registry-names.generated.ts`, 81 datasources /
  115 managers, `pnpm --filter engine generate:registries`) because
  importing the live registry maps would reintroduce the
  datasource/http/git/exec subtree the browser bundle deliberately
  severs (shims/datasource-index.ts) — a Node-side drift test imports
  the real maps and fails the suite if a renovate bump stales the lists.
  Free text stays legal (FormState unchanged; custom datasources
  typable; the field works before the engine chunk loads).
  `updateType` stopped being a primary select: it renders as the 015
  derivation's one-liner (`updateType: patch — derived from … ·
override`) with the select behind "override". Everything else —
  `manager`, `sourceUrl`, `depName`, `depType`, `packageFile`, and the
  whole former "More fields" tier — merged into ONE "More about this
  update" drawer whose summary line shows the values it holds (015's
  promoted `sourceUrl` keeps its scent there).
- **The evidence drawers.** New shared `SummaryDrawer` component
  (controlled `<details>`; body only renders while open). "Matched
  rules" (summary: `N of M matched` + per-layer ProvenanceChip×count
  badges) holds the rule list and its filters; "How the final config
  was built" (summary: `base → N merges → flatten ⊘7 → final · changed
…`) holds the 046 merge timeline and step panel. Cross-links open
  what they target: the verdict's matched-count link opens the rules
  drawer; ledger step links, the flatten aside, and a share link's
  `simStep` open the merge drawer at the right stop; validation-message
  rule jumps open the rules drawer first. Drawer state survives
  re-simulation; opening one never closes the other.
- **The consumed-blocks aside earns its place.** Confirmed against the
  pinned renovate: defaults define all seven update-type blocks with
  major/minor/patch empty, so "consumed, none applied" was true on
  nearly every run. The engine's `FlattenResult` gained
  `authoredBlocks` (blocks whose content differs from
  `getDefaultConfig()`), and the verdict card now shows the aside only
  for an authored block that was consumed without applying — naming the
  block, its keys, a preset chip when exactly one matched rule merged
  it, and the reason (wrong `updateType`, or none set). Default-only
  consumption renders nothing; the timeline's `flatten ⊘7` chip keeps
  the mechanics discoverable.
- **Provenance chips explain themselves.** User decision: keep the
  "repo config" label (it reads as the docs' Repository-tier category
  but means the contributing LAYER); instead, `ProvenanceChip` — the
  one shared chip component — gained a 016 glossary hover card:
  kind-specific opening line, the merge order `default → global config
→ inherited config → repo config` (later levels win) with the chip's
  own level marked, and the preset-chip click-to-tree note. Preset
  chips stay clickable.

## Non-goals

- No new disclosure below the two levels (page → drawer); the step
  panel inside the merge drawer is selection, not a third fold.
- The verdict card's content (046) is unchanged apart from the aside;
  A/B pinning and share-link encoding are untouched (FormState kept its
  shape).

## Build note

`renovate/dist/modules/{datasource,manager}/api.js` must never be
imported from code the browser bundle reaches — they eagerly pull the
severed subtree and break `vite build` (find-up → unicorn-magic browser
condition). Node-only code (the codegen script, golden tests) may
import them freely.
