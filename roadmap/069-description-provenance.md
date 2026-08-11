# 069 — Per-string `description` provenance: who said what about this config

Milestone: M19 · Status: in progress (PR 1 of 5 landed)

Mockups: [mockups/069/](mockups/069/)

## Summary

Every Renovate preset carries a `description` its author wrote — "Pin Docker
digests.", "Use semantic commit type `fix` for dependencies and `chore` for all
others if semantic commits are in use." — and the resolved config carries all
of them, concatenated into one flat array with no indication of who wrote
which. `{"extends": ["config:best-practices"]}` produces 22 of these sentences.
Read end to end they are the single best plain-English answer to "what does
this config actually do", and the app currently renders them as an anonymous
string array in the Effective config, one row among ninety.

The information is not lost, only unlinked: array concatenation is positional,
and the app already holds the preset tree that produced the array. 069 restores
the link — every string attributed to the exact preset-tree node that wrote it
— and then spends it across the UI. This document covers the whole feature; the
first PR is the engine primitive alone.

## User story

As someone reading a config I did not write (mine from six months ago, or the
one my platform team ships), I want each sentence of that wall of descriptions
to name the preset that contributed it, so that "what does this config do" and
"which preset do I remove to stop doing that" are the same question.

## The merge mechanics

`description` is an ordinary option — `type: "array"`, `subType: "string"`,
`allowString: true`, `mergeable: true` (`dist/config/options/index.js`). Three
consequences, all confirmed against the pinned Renovate 44.7.4:

- `massageConfig` coerces `"a string"` to `["a string"]` for `allowString`
  options, on every preset body and on the top-level config. By the time the
  trace records a node's `input`, the description is always an array.
- `mergeChildConfig` (`dist/config/utils.js`) concatenates when both sides have
  the key and the option is a mergeable array: `parent.concat(child)`, in
  encounter order, **never deduplicated**. Extend the same preset twice and its
  sentence appears twice.
- `resolveConfigPresets` (`dist/config/presets/index.js`) resolves each entry of
  `extends` in order — recursively, so each subtree arrives already flattened —
  and merges the node's OWN body **last**. So the order is: children in
  `extends` order (depth-first), then the node's own sentence.

`packageRules[n].description` is a different thing entirely: nested bodies are
resolved separately and never hoisted to the top level.

## The attribution algorithm

`computeDescriptionProvenance(result)` in
`packages/engine/src/trace/description-provenance.ts` — the per-string
counterpart to `computeProvenance` (per key) and `computeRuleProvenance` (per
`packageRules` entry), built from the same trace data, with the same
availability guard (`finalConfig` present, root `input`/`resolved` present).

It is a **positional replay**, not value matching. Value matching would be
easier and wrong: two presets that write the same sentence must attribute to
their own nodes, and the fixture below contains exactly that case twice. The
walk mirrors one `resolveConfigPresets` invocation per node — merging children
in `extends` order, own `input.description` last — using the same participant
filter `computeProvenance`'s `buildLayers` uses (non-nested, resolved children
only; `already-seen` and `ignored` nodes never merged and contribute nothing).

Each string comes back as `{ index, value, node, viaTopLevel, duplicateOfIndex?,
approximate? }`: `node` is the exact preset that wrote it, `viaTopLevel` is the
direct-extend layer it arrived through (the same `ProvenanceLayer` identity the
005/013 provenance uses, so `defaults`/`global`/`inherited`/`repo` are
expressible too), and `duplicateOfIndex` points a repeated sentence at its first
occurrence.

### `index` is a position in the real array

`description` is `subType: "string"`, but a wrong-typed member is a validation
**warning**, not a refusal: `{"description": ["a sentence", 42]}` resolves, and
the `42` reaches the final array and occupies index 1. So the result reports
three things about the final array rather than one:

- `entries` — the string members, each `index` being the member's position in
  the **real** array. Only strings can have an author, so only strings take part
  in the positional replay; they are paired with it through a cursor of their
  own, which is what keeps an entry after a non-string from claiming the index
  the non-string holds.
- `unattributed` — `{ index, value }` for every non-string member: accepted by
  Renovate, written by nobody the walk can name.
- `finalLength` — the real array's length, so a consumer can say "position N of
  M" without re-deriving it from two lists.

The per-node and whole-run alignment checks still compare string members only,
so a stray non-string is not by itself a reason to degrade; `entries.length +
unattributed.length === finalLength` always.

### Fallback semantics

Correctness is self-checked rather than assumed: at every node the replayed
sequence is compared against that node's ground-truth `resolved.description`,
and the whole run against `finalConfig.description`. Where they disagree — an
unmodelled drop, a reorder, a future Renovate change — the subtree **degrades to
its enclosing node**: every string of the ground truth is attributed to that
node with `approximate: true`, and `degraded` is set on the result.

Two reasons this beats `undefined` (the choice `computeRuleProvenance` makes for
a misaligned `packageRules` replay) and beats throwing: a description is prose,
so "contributed by the `config:best-practices` subtree" is still a useful
answer, whereas a confidently wrong leaf is worse than none; and because the
fallback re-seeds from ground truth, one contradicting subtree cannot
desynchronise the indices of everything after it. The UI is expected to render
`approximate` entries with the subtree name and no leaf claim.

## The drop rules

Three places delete a description before it can merge. All three are reported in
`dropped` (`{ value, node, reason, droppedBy?, approximate? }`) rather than left
as an unexplained absence, because "why isn't my preset's description showing
up" is one of the questions this feature exists to answer. `approximate` carries
the same meaning it has on an entry, and for the same reason: a subtree that had
already degraded to its enclosing node can then be muted by the quirk below, and
the guessed author must stay labelled as a guess once it becomes a drop. The two
`getPreset` drops are read off a pristine body and are never approximate.

- **`wrapper-preset`** — `getPreset` deletes the description of any preset whose
  keys are exactly `{description, extends}`. `config:best-practices` and
  `config:recommended` are both this shape, so the two headline presets'
  own one-line summaries never reach the config that extends them.
- **`package-list-preset`** — same, for a preset whose keys are a subset of
  `{description, matchPackageNames}`. This is most of the `packages:` group.
- **`ignore-deps-quirk`** — `resolveConfigPresets` deletes the ENTIRE resolved
  description of a preset when the extending config carries `ignoreDeps: []`
  (length zero). Three internal presets use this deliberately, as a mute button:
  `group:recommended`, `replacements:all` and `workarounds:all` would otherwise
  each contribute a hundred-plus sentences. `droppedBy` names the extending
  node; the `node` on each entry is still the preset that authored the sentence,
  because the walk attributes the subtree first and diverts it afterwards.

The first two happen inside `getPreset`, i.e. **before** the body the trace
records as `input`, so they are detected — not predicted — by comparing the raw
fetched body against the migrated one.

### Renovate mutates its own internal preset table

Detecting the first two from `fetched` alone is a trap, and the engine works
around it. `dist/config/presets/internal/index.js` returns its module-level
preset objects **by reference**, so `getPreset`'s `delete presetConfig.description`
permanently strips the description from Renovate's own table. Renovate resolves
one config per process and never notices. This app resolves one on every
keystroke: from the second run on, `config:best-practices`'s fetched body simply
has no description, and a `fetched`-based detector reports the drop once and
then goes quiet.

So `description-provenance.ts` builds a small index of "which internal preset
loses its own description, and what did it say" **once at module load**, from
the pristine table, and consults it for internal presets. Nothing is mutated and
no Renovate behavior changes — the resolved config is identical either way,
since the description is deleted on every run regardless. Parameterised presets
need no index entry: `replaceArgs` clones before the delete, so their
`afterParams` body is pristine on every run. Hosted presets need none either:
the preset cache is re-initialised per run, so their `fetched` body is fresh.

The same mutation is a latent cosmetic bug in the Preset tree's "fetched" body
view (`PresetDetail.tsx` shows a body that quietly loses its description after
the first run). Out of scope here; noted for whoever picks it up.

## `packageRules` descriptions

`ruleDescriptions` rides along on the same result: `computeRuleProvenance`
already attributes every merged `packageRules` index to a contributing layer, so
reading `description` off the rule body costs nothing. The granularity is
weaker than the top-level attribution — the contributing **layer** (which
direct extend), not the exact node — which is enough for PR 5's simulator
annotation and no more. Per-node attribution of nested bodies would need the
nested `resolveConfigPresets` invocations threaded through the tree; if PR 5
wants it, that is its own piece of work.

## What the real tree does

Verified against `{"extends": ["config:best-practices", ":dependencyDashboard",
"group:monorepos"]}` — 1,088 resolved presets, four levels deep, entirely
offline (internal presets need no network):

- 24 strings in the final `description`, **all 24 attributed exactly**;
  `degraded` is `false` and no entry is `approximate`. The positional replay
  reproduces Renovate's array byte for byte, at every depth.
- Leaves land where they should: "Pin Docker digests." → `docker:pinDigests`,
  four levels down, arriving through `config:best-practices`; the semantic-commit
  sentence → `:semanticPrefixFixDepsChoreOthers`.
- The last two entries are duplicates — `:dependencyDashboard` and
  `group:monorepos` were already pulled in by `config:best-practices`, and
  re-extending them concatenates their sentence a second time. Both carry
  `duplicateOfIndex` pointing at index 0 and 3, and both attribute to the
  top-level extend that repeated them, not to the first occurrence. This is the
  case value matching would get wrong, and it is not exotic: it is what happens
  whenever someone adds a preset that `config:recommended` already contains.
- 2 wrapper-preset drops (`config:best-practices`, `config:recommended`) and
  135 `ignore-deps-quirk` drops from the three mute-button presets.

## The 5-PR plan

1. **Engine** (this PR) — `computeDescriptionProvenance`, exported from
   `packages/engine/src/index.ts` alongside the other provenance entry points.
   No UI.
2. **Overview: "What this config does"** — a digest card built from `entries`,
   the sentences in order with their contributing preset, so the first thing a
   run shows is the config in English.
3. **Effective config: the per-string blame ledger** — the `description` row
   stops being an anonymous string array and becomes a per-string ledger with
   the writing preset, duplicates folded, and the `dropped` list as the answer
   to "where did my description go".
4. **Preset tree: descriptions on the node** — a node that wrote (or lost) a
   sentence carries a hover card on its name quoting it, with a position marker
   for where it landed in the final array (and a struck-through line for a
   dropped one); the detail panel repeats the same facts as a Description entry
   in its source details. A hover surface rather than a view mode: the tree
   already has a tree/table switch, and the rows keep their uniform height for
   the windowing.
5. **Hover attribution + simulator rule descriptions** — hovering a sentence
   anywhere highlights its node in the tree; the simulator's rule ledger picks up
   `ruleDescriptions` so a matched rule can say what it is for.

## Verification (PR 1)

- `test/description-provenance.shimmed.test.ts` — the real fixture above:
  full-array attribution and ordering, the two known leaf attributions, both
  duplicates with their `viaTopLevel` and `duplicateOfIndex`, the wrapper-preset
  drops, the `ignoreDeps: []` drops with their three `droppedBy` presets, a
  repo-config's own description landing last on the root node, a config whose
  `description` holds a number (Renovate warns and keeps it) proving the reported
  indices are positions in the real array, and — the regression guard for the
  mutation above — a second run producing byte-identical `entries` and `dropped`.
- `test/description-provenance.node.test.ts` — the walk in isolation over
  hand-built trees: own-body-last ordering at depth, identical strings from two
  nodes, the raw-string (`allowString`) body, a mixed-type final array with its
  `unattributed` member and `finalLength`, nested/unresolved children excluded,
  each drop rule, the enclosing-node fallback proving that a contradicting
  subtree degrades alone while its siblings keep exact attribution, and that
  fallback's `approximate` surviving into a drop when the quirk mutes it.
