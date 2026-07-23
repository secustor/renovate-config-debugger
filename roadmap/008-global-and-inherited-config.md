# 008 — Global + inherited config layers

Milestone: M3 · Status: planned

## Summary

Extend the pipeline beyond repo config to the layers self-hosted
administrators control: global/admin config (`config.js` / env / CLI) and
inherited config (`inheritConfig`), so the visualizer models the full layer
stack a real Renovate run uses.

## User story

As a self-hosted Renovate administrator, I paste our global config and a
repo's config and see exactly how they combine — which global options repo
users can't override, what `inheritConfig` injects in between, and where
`repositories[]`-level config lands.

## Scope

- Additional input slots: global config (JSON; env/CLI forms out of scope
  initially) and inherited config.
- Engine: run the corresponding Renovate stages (`lib/config/defaults.ts`,
  global validation, `lib/config/inherit.ts`) and add the layers to the merge
  trace, so 005's provenance view shows `default / global / inherited /
preset / repo` badges.
- Model global-only vs repo-allowed option boundaries (`globalOnly` flag in
  option metadata); flag repo-config attempts to set global-only options.
- Validation of each layer with the layer-appropriate rules
  (`validateConfig(configType)`).
- Preset resolution within global/inherited layers (e.g. `globalExtends`).
- `platform`/`endpoint` from the global config feed 010's platform-context
  UI: the control reflects the global-config values instead of keeping its
  own state, and manually changing it becomes an explicit override with a
  warning (see 010, "Platform context").

## Out of scope

- Secrets/decryption handling beyond passing `secrets` placeholders through;
  `hostRules` credential semantics.
- Parsing `config.js` JavaScript — JSON representation only at first.

## Dependencies

- 001, 005 (provenance view is what makes this legible).
