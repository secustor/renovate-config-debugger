# 008 — Global + inherited config layers

Milestone: M3 · Status: done 2026-07-23

> Implemented as specified. Two new pipeline stages (`global`, `inherit`) run
> before the repo stages and skip byte-identically when their input is absent.
> The global layer replicates upstream `parseConfigs`: migrate/massage/
> `validateConfig("global")`, `globalExtends` resolved and merged UNDER the
> config, then Renovate's real `GlobalConfig.set` captures the ~55 run-context
> options — the stripped remainder is the merge layer, so defaults stay
> unstripped and an absent global config behaves exactly like an empty one.
> The inherited layer replicates `mergeInheritedConfig` minus platform
> fetch/decrypt/templating: `validateConfig("inherit")` (errors exclude the
> layer, where upstream aborts the run), `removeGlobalConfig(…, keepInherited)`,
> preset resolution against the assembled base, re-validate, re-strip, then
> `InheritConfig.set` captures its 11 options. Deviations: inherited configs
> are also migrated+massaged (upstream only validates) so the trace shows
> canonical forms, and `removeGlobalConfig` is reimplemented as its pure
> 7-line `getOptions()` loop because deep-importing `dist/config/index.js`
> would pull the whole modules/manager graph into the browser bundle
> (`InheritConfig` is re-exported through the adapter as usual). 005's
> provenance replays the layers before the presets (`layerConfigs` on the
> trace), with the nested-`extends` correction now measured against the repo
> resolution merged onto the layer base. The platform-context control reflects
> global-config `platform`/`endpoint` ("from global config"), a manual change
> becomes a warned override recorded as `platformContext.overridden`, and v2
> share links carry both layers (v1 links still decode; tokens and injected
> presets stay excluded).

## Summary

Extend the pipeline beyond repo config to the layers self-hosted
administrators control: global/admin config (`config.js` / env / CLI) and
inherited config (`inheritConfig`), so the debugger models the full layer
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
