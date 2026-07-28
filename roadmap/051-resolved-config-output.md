# 051 — Effective config: the resolved config as a copyable document

Milestone: M14 · Status: done (2026-07-28)

Mockup (approved 2026-07-28, variant B — explicit view switch + output
options; the proposed filter-bar checkbox was rejected in review, see
"Why a mode" below):
[mockups/051/effective-config-output.html](mockups/051/effective-config-output.html)

## Summary

The Effective config tab explained _where every option came from_ but
could not produce _the document those options add up to_. The one
copyable config artifact in the app was the Rewrites tab's "Copy
migrated config" — the pre-resolution document, extends untouched. 051
adds the post-resolution counterpart: an **As JSON** rendering of the
Effective config card with two expansion levels —

- **keep internal presets** (default): hosted/fetched presets inlined
  AT ANY DEPTH, internal presets kept as `extends` references wherever
  they were found — an internal reference inside an inlined hosted
  preset is hoisted into the root `extends` (deduped, encounter order).
  The common real-world shape is one org preset wrapping
  `config:recommended` (e.g. `github>renovatebot/.github`); a top-level-
  only split would collapse this mode into "fully" for exactly that
  case. The result is the consolidation people actually paste back into
  a renovate.json: their own preset plumbing flattened,
  `config:recommended` still readable and still tracking upstream.
- **fully**: every preset consumed, no `extends` left — optionally
  hydrated with the defaults underneath ("include defaults"), matching
  how Renovate applies them (defaults first, resolved config on top).

Each copyable document is one stage of the pipeline the app already
teaches, owned by the tab that explains that stage; the tab boundary is
preset resolution. The JSON view cross-links back to Rewrites for the
pre-resolution document.

## Why a mode, not a checkbox

The original ask was a "resolved shallow config, without internal
presets" checkbox in the filter bar. Rejected: the existing checkboxes
(_only overridden_, _show default-only_) filter rows of the SAME
document and promise composition; this option produces a DIFFERENT
document (a second merge replay) in a different rendering. Composed
with the row filters it yields incoherent states — override chains
referencing layers that no longer exist — and half the card's controls
would go dead while staying visible. The segmented **By key / As JSON**
switch in the card title (the diff chrome's unified/side-by-side
grammar, 036: label the state, not the action) makes the whole-panel
change legible, and each rendering carries only the controls that apply
to it.

## Engine

`computeResolvedConfig(result, mode, opts)` in
`packages/engine/src/trace/resolved-config.ts` — the document
counterpart to `computeProvenance`, built from the same trace data by
the same `mergeChildConfig` replay, same availability guards.

- `"full"` is `root.resolved` (the repo-level resolution), optionally
  defaults-hydrated. Deliberately repo-scoped: the 008 global/inherited
  layers are runtime context, not part of a committable repo config.
- `"keep-internal"` recursively flattens the tree: a node is inlined
  only when positively known to be non-internal AND successfully
  resolved (with a migrated body to inline); its own internal
  references bubble up into the root `extends`. Everything else
  (internal, errored, ignored, unclassifiable) stays referenced — a
  kept reference is at worst verbose, a wrongly-inlined one is wrong.
  `ignorePresets` is preserved so kept-but-ignored references stay
  ignored; nested `extends` inside body values (`packageRules[n]`) ride
  along as written. `description` is excluded from the divergence
  check: it concatenates once per reference, so deduping a preset kept
  at several depths legitimately drops the repeat.
- **Merge-order honesty.** The emitted document necessarily reorders
  merges: kept references resolve before the body, even when written
  after an inlined preset. Rather than pretend exactness, the replay
  runs in both orders and reports every top-level key that changes as
  `divergingKeys`; the UI attaches a warn-tinted caveat naming them and
  pointing at "fully" for an exact document. The shimmed test proves a
  reported divergence is real by re-running the pipeline on the emitted
  document (internal presets resolve offline) and watching the key
  flip — and conversely that an empty list round-trips to an identical
  `finalConfig`.
- "include defaults" is a `"full"`-only option, enforced in the engine
  AND disabled in the UI: explicit defaults written into a body that
  still extends presets would merge after — and override — the kept
  presets.

## App

`EffectiveConfig.tsx`: an `EffectiveView` mode (`keys`/`json`) with the
segmented switch in the card title (`.effective-card-title` joins the
039 title-row grammar), reset per run with the rest of the view state.
The JSON view is `ResolvedJsonView` — an options row in the
`.prov-filters` chrome (expansion select, defaults checkbox with an
explanatory title, "Copy resolved config" aligned with Rewrites' "Copy
migrated config" naming) over a `config-view` render of the document,
computed through `useResolvedConfig` (dynamic engine import, mirrors
`useProvenance`). Row filters render only in the By-key view.

## Verification

- Engine: `resolved-config.shimmed.test.ts` — keep/inline split, rule
  concat order, pipeline round-trip, real-divergence flip, ignored
  presets, nested extends preserved as written, full/defaults
  hydration, unavailability.
- e2e 15: switch to As JSON on the default config → `config:recommended`
  stays referenced, filters absent; fully → no extends, defaults
  checkbox enables and hydrates `branchPrefix`; switch back restores
  the rows.
