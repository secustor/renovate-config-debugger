# 045 — Auto-load the inherited config for a loaded repository

Milestone: M12 · Status: planned

## Summary

The inherited-config layer (008) is paste-only: a user modeling their
org's real setup must know where the org keeps its inherited config,
open it, and paste it — even though "Load from repo" (007) already
knows the repository and the platform context, and Renovate's own
resolution is fully deterministic from there. Resolve it the way a real
run does: when the global config enables `inheritConfig`, fetch
`inheritConfigFileName` (default `org-inherited-config.json`) from
`inheritConfigRepoName` (default `{{parentOrg}}/renovate-config`,
templated with the loaded repo's owner) via the same browser transports,
and fill the layer automatically.

## Scope

- **Trigger and gating, honest to a real run.** Auto-resolution runs on
  a successful "Load from repo" when the global-config layer sets
  `inheritConfig: true` (its real default is `false` and it is
  `globalOnly` — verified against the pinned renovate's option table).
  No global config, no silent fetching; instead the Advanced zone's
  inherited-config field gets a one-click "probe for
  `<org>/renovate-config`" affordance that does the same fetch as an
  explicit, user-initiated act.
- **Resolution, Renovate's own.** `{{parentOrg}}` templates to the
  loaded repo's owner/group; `inheritConfigRepoName` /
  `inheritConfigFileName` overrides in the pasted global config are
  honored. The fetch goes browser → platform API under the existing
  platform context, with the same support matrix, sign-in, and per-host
  tokens as repo loading (hosts that don't serve CORS stay paste-only).
- **Missing-file semantics match `inheritConfigStrict`.** Absent file
  with `inheritConfigStrict: false` (default): a quiet note, layer
  stays empty — exactly what a real run does. With `strict: true`: the
  layer reports the same hard error a real run would raise.
- **Provenance in the UI.** An auto-filled layer is labeled with where
  it came from (`org/renovate-config · org-inherited-config.json`) and
  stays editable — editing flips it to the existing "pasted" state so
  what-if experiments keep working. The 008 pipeline stages and badges
  are unchanged; this item only fills the input.
- **Share links** already carry the inherited layer's content (008);
  an auto-loaded layer rides that unchanged, so links stay
  self-contained and never trigger fetches on open.

## Out of scope

- Auto-loading the GLOBAL config layer — it lives in the bot's
  deployment (config.js/env/CLI), not in any fetchable repo; there is
  nothing deterministic to resolve it from.
- Nested-group `parentOrg` edge cases beyond what Renovate's own
  templating produces for the platform (GitLab subgroups follow
  whatever the real `{{parentOrg}}` resolves to; no extra probing).
- Watching for upstream changes to the inherited file — the layer is a
  snapshot, like every other input.

## Dependencies

- 008 (the layer stack and inherit-stage semantics this fills), 007
  (Load from repo and the platform context the fetch rides on), 009
  (sign-in for private org config repos), 010 (the preset/transport
  support matrix that bounds which hosts work).
