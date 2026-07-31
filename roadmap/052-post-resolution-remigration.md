# 052 — Fidelity: re-migrate the resolved config (upstream parity)

Milestone: M14 · Status: done (2026-07-31)

## Summary

Real Renovate migrates the repo config **twice**: once before preset
resolution (`migrateAndValidate`, mirrored by the pipeline's Migrate
stage) and once **after** it — `mergeRenovateConfig`'s "Resolved config
needs migrating" pass (`lib/workers/repository/init/merge.ts`). The
pipeline only ran the first pass, so everything downstream of the
preset stage — the effective config, the packageRules simulator, the
resolved-config output — operated on a config real Renovate never
runs with.

052 adds the second pass to the preset stage, immediately after
`resolveConfigPresets`, exactly where upstream runs it. No re-massage
and no re-validate: upstream does neither at that point.

## The bug that surfaced it

`extends` inside a packageRule (a real-world preset shape — see
`secustor/renovate-config`'s "Automerge safe NodeJS updates" rule):

```json
{
  "extends": ["group:nodeJs"],
  "groupName": ["NodeJS"],
  "matchUpdateTypes": ["patch", "minor"],
  "automerge": true
}
```

`resolveConfigPresets` recurses into packageRule objects, so the
preset's content merges INTO the rule — leaving the preset's own rules
nested under a `packageRules` key that no matcher ever reads. The
rule's only live matcher is then `matchUpdateTypes`, i.e. it matches
every patch/minor update. The simulator faithfully reported that — and
disagreed with real Renovate, which leaves e.g. an `oxlint` minor
update ungrouped and un-automerged.

The post-resolution migration is what defuses this upstream: its
"Flattening nested packageRules" block replaces the parent with one
combined rule per subrule (`mergeChildConfig(parent, subrule)` —
parent matchers AND preset matchers), and the general migration pass
also coerces `groupName: ["NodeJS"]` to the string `"NodeJS"`. The
effective rule then matches only actual Node.js updates
(`matchDatasources: ["docker", "node-version"]` + node package names),
which is precisely the observed real-run behavior (standalone oxlint
PR; node.js PR on branch `renovate/nodejs`).

## Tracing

The pass runs inside the preset stage — no new StageId, since upstream
treats it as part of assembling the resolved repo config, not a
distinct phase:

- The instrumented `migrateConfig` shim emits its granular
  `migration-applied` events as usual; in this position they carry
  `stage: "preset"` and **no `presetName`**, which distinguishes them
  from fetch-time preset migrations in the same stage (those always
  name the preset being fetched). The migrate stepper (stage-gated to
  `migrate`) and the preset tree (keyed by `presetName`) are both
  unaffected by construction.
- The preset stage's `stage-complete` now carries the re-migrated
  config as `after` (its delta spans resolution + re-migration), and
  its title appends "then re-migrated the resolved config" when the
  pass changed anything.

## Guardrails

- `test/fixtures/preset-package-rules.json` joins the golden/shimmed
  snapshot loop: the golden `reference()` restatement gained the same
  post-resolution `migrateConfig` call, so the fixture's snapshot is
  Renovate's own output, and the shimmed project must reproduce it
  byte-for-byte.
- A shimmed trace-shape test pins the flattened rule's shape (combined
  matchers, no nested `packageRules`, no `extends`) and the
  `FlattenNestedPackageRules` step's placement (preset stage, no
  presetName).

## Out of scope

- The global/inherited layers (008) re-migrate nothing after their own
  preset resolution — upstream's `parseConfigs`/`mergeInheritedConfig`
  don't either.
- Upstream's trailing `resolveConfigPresets` over the merged
  return-config (merge.ts line ~211, for presets the global/inherited
  layers contribute post-merge) remains unmirrored; the pipeline's
  layers resolve their own presets before merging.
