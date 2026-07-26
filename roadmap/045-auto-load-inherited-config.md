# 045 — Auto-load the inherited config for a loaded repository

Milestone: M12 · Status: planned

## Summary

The inherited-config layer (008) is paste-only: a user modeling their
org's real setup must know where the org keeps its inherited config,
open it, and paste it — even though "Load from repo" (007) already
knows the repository and the platform context, and Renovate's own
resolution is fully deterministic from there. Resolve it the way a real
run does: fetch `inheritConfigFileName` (default
`org-inherited-config.json`) from `inheritConfigRepoName` (default
`{{parentOrg}}/renovate-config`, templated with the loaded repo's
owner) via the same browser transports, and fill the layer
automatically. User decision 2026-07-26: this is a **default-enabled
checkbox in the repo-load form**, not something gated on a pasted
global config.

## Scope

- **Trigger: a checkbox in the repo-load form (039), checked by
  default.** "Also load the org's inherited config" runs the probe on
  every successful "Load from repo" unless unticked; the choice
  persists like the form's other state. Default-on is the honest
  default: the public Mend-hosted GitHub app runs with `inheritConfig`
  enabled, so for the most common real-world setup the probe models
  exactly what the bot does. The option itself defaults to `false` and
  is `globalOnly` (verified against the pinned renovate's option
  table), so the only case needing a hint is a pasted global config
  that explicitly sets `inheritConfig: false` — then the auto-loaded
  layer says a run under THAT global config would not apply it.
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
