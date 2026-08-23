# 069 — Per-string `description` provenance: who said what about this config

Milestone: M19 · Status: in progress (PRs 1–5 written; the stack is in review)

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
resolved separately and never hoisted to the top level — which is why the
simulator (PR 5) is the only place they surface.

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

**PR 5 did not want it, and the reason generalises.** The quote's attribution
line has exactly two jobs: say whose voice it is, and — for the reader's own
rules — say which of their rules it was. The first is already answered beside
it by the row's provenance chip, which names the layer; the second needs
`sourceIndex`, which is layer-granular by construction (it is an index into
that layer's own `packageRules`). A node-granular attribution would let the
line name `security:minimumReleaseAgeNpm` instead of the extend that carried
it — a nicer sentence, bought with the nested-resolution threading, in a place
where the chip already says as much. So the layer granularity shipped as-is and
the nested machinery stays unbuilt.

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
   for where it landed in the final array; the detail panel repeats the same
   facts as a Description entry in its source details. A sentence Renovate shed
   on merge (wrapper / package-list / mute) reads the same, minus the marker —
   shedding is Renovate working as designed, so the node's own card shows the
   sentence, not the mechanics, which stay on the ledger's dropped footer. A
   hover surface rather than a view mode: the tree already has a tree/table
   switch, and the rows keep their uniform height for the windowing.
5. **Hover attribution + simulator rule descriptions** — attribution at the
   point of contact (mockup variant D): a `description` string in the resolved
   JSON document carries a hover card naming the preset that wrote it, and a
   matched simulator rule quotes its author's own sentence. See "What PR 5
   shipped" below for what that turned into.

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

## What PR 5 shipped

Two surfaces, no new panel — the text was already on screen, only anonymous.

**The JSON document's strings.** In the Effective config's "As JSON" view, each
string of the top-level `description` array is an anchor for the app's standard
hover card (`components/hover-card.tsx`): the writing preset's chip and _wrote
this description_, the root-to-writer `extends` path (`(input config) ›
config:best-practices › docker:pinDigests`, elided in the middle past six
segments), `Position 16 of 24 · duplicate of #4 · also sets 2 packageRules`, and
a _Show in preset tree →_ jump on the same `onSelectPreset` plumbing every chip
in that view uses. The path and the rule count are free: `computeTreeStats`
already keeps a per-run `parents` map and each node's own rule count.

The scope is what the attribution can honestly carry. Attribution is by INDEX
into the final `description` array, so `descriptionCardsFor` compares the
rendered document's array against it — each entry at its REAL index, and every
index the engine reports as unattributed still holding a non-string — and
attaches nothing on any disagreement, which is exactly what happens in the
As-JSON view's default keep-internal mode (presets still referenced, so their
sentences are absent) and in the defaults-hydrated document. Real indices,
because a `description` array may legally hold non-strings (Renovate only warns
about `["a", 42]`): those members get no card and render as plain JSON, but they
occupy positions, so the cards are handed back placed BY index and the facts
line counts the whole array — `Position 3 of 4`, not `3 of 3`. Preset-body views
(`PresetDetail`) keep plain rendering: a preset's own `description` is a
different array again.

The affordance is the glossary's, not a new one. `useHoverCard` and the anchor
component were hoisted out of `components/glossary.tsx`
(`components/hover-card-hooks.ts` + `components/hover-card.tsx` — the hook sits
beside the component it exists for, as that file's own header ledgers), so the
attribution card inherits the
one-card-at-a-time singleton, the pointer grace period, focus reachability and
the 068 Escape ruling rather than restating them. `Term`/`Explained` are now
that primitive with a glossary body. Two consequences worth knowing: the chip
inside the card is a static badge, not a `ProvenanceChip` (a `ProvenanceChip`
opens a card of its own, and the singleton would close the card it stands in),
and the _Show in preset tree_ link is pointer-reachable only, since the card is
portalled to `<body>` and closes on blur — the attribution itself is fully
keyboard-readable, the jump is the extra.

One thing the hoist had to add for that keyboard reachability: the hide-on-scroll
ignores scrolls arriving within `SHOW_SCROLL_GRACE_MS` of the show, and
re-anchors on them instead. Tab onto a string only partly in view and the browser
scrolls it into view itself; that scroll landed in the capture listener a frame
after the card opened and closed it again, so every anchor that was not already
fully visible had no keyboard card at all. Re-anchoring rather than merely
ignoring, because the anchor really did move — a card left at its opening
coordinates points at whatever slid under it.

**The simulator's matched rules.** `buildRuleDescriptions` indexes the engine's
`ruleDescriptions` by merged rule index; a matched row then quotes the author's
sentences (one line each — a rule description is commonly two separate
sentences) with a muted attribution line: _author's description of this rule_
for a preset rule, _your description, packageRules[0] in your repo config_ for
the reader's own, using `sourceIndex` so the citation is an index they can find
in their editor rather than `packageRules[312]`. It renders on both surfaces
that show a rule — the matched-rules drawer row (`RuleRow`) and the verdict
card's rule-evidence popover, which carries it on `RuleEvidence` so the popover
needs no lookup of its own. Never on a no-match row: there the sentence explains
a rule that did nothing.

`rcd simulate` needs no change — it formats its verdict lines from the engine's
`RuleEvaluation` directly rather than from an app derivation, and no headless
export changed.

Deviations from the mockup, both deliberate: the path's root segment is the
tree's own `(input config)` rather than the mockup's shortened `(input)`, and
the repo-rule citation says "in your repo config" rather than naming
`renovate.json` — the simulator is not told the config's file name, and naming
the wrong file would be worse than naming none.

### Verification (PR 5)

- `src/lib/description-attribution.test.ts` — the card model: the path (and its
  elision), the facts line with its duplicate and packageRules clauses, the repo
  config's own sentences not masquerading as a preset, and the positional guard
  refusing a shorter array, a reordered one and a non-array.
- `src/features/simulator/rule-descriptions.test.ts` — the three attribution
  wordings, the merged-index keying, and the empty cases.
- `src/components/EffectiveConfig.test.tsx` — the wiring end to end on a real
  run: no cards in keep-internal mode, cards in fully-expanded mode, the card's
  path and position, and its tree jump.
- `src/features/simulator/RuleRow.test.tsx`, `RuleEvidenceCard.test.tsx` and
  `rule-evidence.test.ts` — the quote where it belongs (outside the head button,
  above the clause evidence), and only on a matched, described rule.

## Addendum — 2026-08-23: `writtenBy`, the same honesty rule for a KEY

069 attributes a description string to the exact node that wrote it. A key's
provenance could not do that: `computeProvenance` replays the TOP-LEVEL merge
layers only, so a preset step could name the direct extend and nothing more —
`config:recommended` "sets" `dependencyDashboard` when `:dependencyDashboard`
wrote it, two levels down. `aa55bfc` closes the gap with an optional
`writtenBy: { nodeId, name }` on `ProvenanceStep`
(`packages/engine/src/trace/provenance.ts`).

The mechanism is this document's, one level up. `collectWriters` walks the
extend's subtree in Renovate's own resolution order — children in `extends`
order, the node's own body last, non-nested resolved children only — and keeps
the LAST node whose own `input` carries the key, plus how many nodes did. The
walk itself is no longer a second copy: the second cleanup pass moved the
participant filter and the replay into `trace/tree.ts` (`mergingChildren`,
`walkResolutionOrder`), which `description-provenance.ts` and `collectWriters`
now share.

What makes it 069's rule rather than a guess is the verification, and the three
ways it declines to answer:

- the writer IS the direct extend — the layer already names it, so there is
  nothing to add;
- the option is `mergeable` and more than one node in the subtree wrote it —
  several authors, no single writer to name;
- the writer's own value does not `deepEqual` the extend's ground-truth
  `resolved` value for that key — a migration, an in-subtree merge or a `force`
  reshaped it on the way up, so the leaf would be a confident wrong claim.

Absence over a guess, exactly as the description ledger degrades rather than
name a leaf it cannot verify.

Both headless surfaces spend it. The Effective config's cascade card renders
the writer as the standard `PresetName` token through `LayerSource` (081's
token, whose hover card's via chain is what says how the nested preset got
there), falling back to the layer's own chip when there is no verified writer;
`rcd provenance` and the `get_provenance` tool report the same field as
`writtenBy: "preset <name>"`. Pinned by case (g) of
`test/provenance.shimmed.test.ts`: a value written two levels inside a wrapper
names the deep preset, and a preset that writes its own key carries no
`writtenBy` at all.
