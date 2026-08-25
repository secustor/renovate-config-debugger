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
// ---- Manager extraction (roadmap 078) --------------------------------------
// Filename → manager detection: the generated per-manager file patterns are
// already in the bundle transitively (loadManagerOptions), and getMatchingFiles
// is upstream's own path-only matching step — browser-safe (minimatch + regex).
export { managerDefaultConfigs } from "renovate/dist/manager-default-configs.generated.js";
export { getMatchingFiles } from "renovate/dist/workers/repository/extract/file-match.js";
// extract.ts seeds the file store through upstream's own fs module, so the
// golden project (real fs under GlobalConfig.localDir) and the shimmed one
// (the in-memory shims/fs.ts) run identical engine code.
export { writeLocalFile } from "renovate/dist/util/fs/index.js";
export type {
  ExtractConfig,
  PackageDependency,
  PackageFileContent,
} from "renovate/dist/modules/manager/types.js";
import type { ExtractConfig, PackageFileContent } from "renovate/dist/modules/manager/types.js";

type ManagerExtractFn = (
  content: string,
  packageFile: string,
  config: ExtractConfig,
) => PackageFileContent | null | Promise<PackageFileContent | null>;

/**
 * The curated lazy map of per-manager extract entry points — deep imports,
 * never `modules/manager/api.js` (the barrel statically imports all 129
 * managers: 2.8 MB plus got/WASM/@yarnpkg, and renovate ships no `sideEffects`
 * flag to shake it). Each mapped manager is its own lazy chunk. npm and maven
 * are `extractAllPackageFiles`-only on the barrel; their internal single-file
 * functions are used instead, which deliberately skips npm's lockfile-sweeping
 * `postExtract` and maven's parent-POM resolution (roadmap 078's single-file
 * semantics). The map grows by demand, one entry + one golden/shimmed fixture
 * pair at a time.
 */
export const managerExtractors: Record<string, () => Promise<ManagerExtractFn>> = {
  cargo: async () =>
    (await import("renovate/dist/modules/manager/cargo/extract.js")).extractPackageFile,
  dockerfile: async () =>
    (await import("renovate/dist/modules/manager/dockerfile/extract.js")).extractPackageFile,
  "github-actions": async () =>
    (await import("renovate/dist/modules/manager/github-actions/extract.js")).extractPackageFile,
  gomod: async () =>
    (await import("renovate/dist/modules/manager/gomod/extract.js")).extractPackageFile,
  "helm-values": async () =>
    (await import("renovate/dist/modules/manager/helm-values/extract.js")).extractPackageFile,
  maven: async () => {
    const { extractPackage } = await import("renovate/dist/modules/manager/maven/extract.js");
    return (content, packageFile, config) => extractPackage(content, packageFile, config) ?? null;
  },
  npm: async () =>
    (await import("renovate/dist/modules/manager/npm/extract/index.js")).extractPackageFile,
  nuget: async () =>
    (await import("renovate/dist/modules/manager/nuget/extract.js")).extractPackageFile,
  pep621: async () =>
    (await import("renovate/dist/modules/manager/pep621/extract.js")).extractPackageFile,
  pip_requirements: async () =>
    (await import("renovate/dist/modules/manager/pip_requirements/extract.js")).extractPackageFile,
};
