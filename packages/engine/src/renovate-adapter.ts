/**
 * One of the TWO modules that deep-import renovate/dist; the other is
 * ./shims/renovate-internals.ts, which exists because a shim routing through
 * this file would close an import cycle (this module re-exports
 * config/presets/index.js, whose per-host children the preset shims replace).
 *
 * Renovate has no public API — when a release moves a file, those two are the
 * only places to fix. Lint enforces the boundary (.oxlintrc.json).
 */
export { parseFileConfig } from "renovate/dist/config/parse.js";
export { migrateConfig } from "renovate/dist/config/migration.js";
export {
  type Migration,
  MigrationsService,
} from "renovate/dist/config/migrations/migrations-service.js";
export { massageConfig } from "renovate/dist/config/massage.js";
export { validateConfig } from "renovate/dist/config/validation.js";
export { resolveConfigPresets } from "renovate/dist/config/presets/index.js";
export { parsePreset } from "renovate/dist/config/presets/parse.js";
// Renovate's bundled preset bodies (`group:`, `monorepo:`, `packages:`, …).
// Synchronous and network-free, and already in the module graph via
// `presets/index.js` — roadmap 014's `group:`-preset translation reads the
// flagged group's OWN body rather than restating it, so the suggested rule
// can't drift from the pinned Renovate.
// `groups` is the raw table those bodies live in — the SAME objects renovate
// hands out, which `getPreset` mutates (see trace/description-provenance.ts).
export {
  getPreset as getInternalPreset,
  groups as internalPresetGroups,
} from "renovate/dist/config/presets/internal/index.js";
export { mergeChildConfig } from "renovate/dist/config/utils.js";
export { getConfig as getDefaultConfig } from "renovate/dist/config/defaults.js";
export { GlobalConfig } from "renovate/dist/config/global.js";
export { InheritConfig } from "renovate/dist/config/inherit.js";
export { getOptions } from "renovate/dist/config/options/index.js";
// The simulator (006) needs the matcher registry only; `applyPackageRules`
// itself is deliberately NOT re-exported — its merge tail is replicated in
// simulate-package-rules.ts, and pulling the real one in would drag slugify +
// template compilation into the browser bundle. The golden/shimmed tests
// deep-import it directly as the behavioral oracle.
export {
  default as packageRuleMatchers,
  type PackageRuleMatcher,
} from "renovate/dist/util/package-rules/matchers.js";
export * as memCache from "renovate/dist/util/cache/memory/index.js";
// The simulator's updateType derivation (roadmap 015) needs a versioning
// scheme's compare functions plus upstream's own major/minor/patch bucketing
// — the same two calls the real dependency lookup makes before an update's
// updateType is ever set.
export {
  get as getVersioningApi,
  type VersioningApi,
} from "renovate/dist/modules/versioning/index.js";
export { getUpdateType } from "renovate/dist/workers/repository/process/lookup/update-type.js";
