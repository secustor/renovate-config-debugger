/**
 * The ONLY module (besides the browser shims in ./shims/) that deep-imports
 * renovate/dist. Renovate has no public API — when a release moves a file,
 * this is the single place to fix. CI enforces this boundary.
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
export { mergeChildConfig } from "renovate/dist/config/utils.js";
export { getConfig as getDefaultConfig } from "renovate/dist/config/defaults.js";
export { GlobalConfig } from "renovate/dist/config/global.js";
export { InheritConfig } from "renovate/dist/config/inherit.js";
export { getOptions } from "renovate/dist/config/options/index.js";
export * as memCache from "renovate/dist/util/cache/memory/index.js";
