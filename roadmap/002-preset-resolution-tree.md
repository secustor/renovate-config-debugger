# 002 — Preset resolution tree

Milestone: M1 · Status: done 2026-07-23 · **MVP centerpiece**

> Implemented as specified, with one mechanism note: the engine reconstructs
> the tree from Renovate's own log stream (forwarded synchronously by the
> logger shim) rather than wrapping the preset fetchers — `resolveConfigPresets`
> logs its `existingPresets` chain on entry and the resolved config on exit,
> which brackets each subtree exactly like a call stack. `TraceResult` gains a
> serializable `presetTree`; the contribution diff replays the parent's merge
> loop with Renovate's real `mergeChildConfig`. Where Renovate aborts on a
> preset error, the tree keeps the failing node (inline error) and labels
> everything cut short as "aborted".

## Summary

Visualize the recursive expansion of `extends` as an interactive tree — the
single most opaque part of Renovate config processing. Every node is a preset:
where it came from, what it contained, what it added to the final config, and
what went wrong if it failed to resolve.

## User story

As a user whose config says `"extends": ["config:recommended", "github>org/renovate-config"]`,
I want to see exactly which presets that pulls in transitively, in resolution
order, so I understand why an option I never set ends up in my effective
config.

## Scope

- Tree UI rooted at the input config; one node per resolved preset, children
  = its own `extends` entries, preserving resolution order.
- Per node:
  - Source badge (internal / github / gitlab / gitea / forgejo / npm /
    http / local) with the parsed reference (repo, path, tag) from
    `lib/config/presets/parse.ts`; `local>` nodes additionally show the
    platform context they resolved against (010).
  - Raw fetched content and its migrated+massaged form (Renovate migrates
    every preset on fetch — show that, it surprises people).
  - Parameters substituted via `replaceArgs` (e.g. `schedule:earlyMondays(...)`).
  - Resolution errors inline on the failing node: not-found, invalid JSON,
    prohibited sub-preset, CORS/network — without aborting the rest of the
    tree where Renovate itself wouldn't abort.
  - "Ignored because listed in `ignorePresets`" state.
- Deduplication indicator when the same preset appears via multiple paths.
- Click a node → side panel with the preset's config and a diff of "merged
  config before this preset" vs "after".
- Engine side: instrument `resolveConfigPresets` (via the logger shim + the
  `PresetApi` seam) to emit `preset-fetch`/`preset-resolved`/`preset-error`
  events with `parentId` nesting.

## Out of scope

- Per-key provenance across the whole merge (005) — this feature is
  per-preset, not per-key.
- Fetchers beyond the ones the engine already ships (github/npm/http):
  gitlab/gitea/forgejo, `local>` semantics and the platform context are 010. The tree must still _render_ their failures legibly from day one.
- Scale features — search, contribution roll-ups, auto-collapse, flat
  view, virtualization — are 011. 002 only needs to not fall over on
  `config:recommended` (~1,000+ nodes): collapse deep subtrees by default
  and keep the DOM bounded.

## Dependencies

- 001 (engine + shims). GitHub PAT input for rate limits lands here if 007
  hasn't yet.
