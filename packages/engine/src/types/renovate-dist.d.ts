/**
 * Ambient declarations for renovate/dist deep imports that ship without .d.ts.
 * Structural types only — kept intentionally minimal; the golden tests are the
 * real behavioral contract.
 */

type RenovateConfig = Record<string, unknown>;

declare module "renovate/dist/config/parse.js" {
  export function parseFileConfig(
    fileName: string,
    fileContents: string,
  ):
    | { success: true; parsedContents: unknown }
    | { success: false; validationError: string; validationMessage: string };
}

declare module "renovate/dist/config/migration.js" {
  export function migrateConfig(
    config: RenovateConfig,
    parentKey?: string,
  ): { isMigrated: boolean; migratedConfig: RenovateConfig };
}

declare module "renovate/dist/config/massage.js" {
  export function massageConfig(config: RenovateConfig): RenovateConfig;
}

declare module "renovate/dist/config/migrations/migrations-service.js" {
  /** One migration instance. `run` mutates the shared migratedConfig. */
  export interface Migration {
    readonly propertyName: string | RegExp;
    readonly deprecated?: boolean;
    /** Present on RenamePropertyMigration — the key the value moves to. */
    readonly newPropertyName?: string;
    run(value: unknown, key: string, parentKey?: string): void;
  }
  // Renovate ships this as a class with only static members; modelled here as
  // a namespace so callers get the same `MigrationsService.getMigrations(...)`
  // access without an extraneous-class lint warning.
  export namespace MigrationsService {
    const removedProperties: ReadonlySet<string>;
    const renamedProperties: ReadonlyMap<string, string>;
    function run(originalConfig: RenovateConfig, parentKey?: string): RenovateConfig;
    function getMigrations(
      originalConfig: RenovateConfig,
      migratedConfig: RenovateConfig,
    ): Migration[];
    function getMigration(migrations: Migration[], key: string): Migration | undefined;
    function isMigrated(originalConfig: RenovateConfig, migratedConfig: RenovateConfig): boolean;
  }
}

declare module "renovate/dist/util/regex.js" {
  export function regEx(pattern: string | RegExp, flags?: string, useCache?: boolean): RegExp;
}

declare module "renovate/dist/util/clone.js" {
  export function clone<T>(input: T): T;
}

declare module "renovate/dist/config/validation.js" {
  export interface ValidationMessage {
    topic: string;
    message: string;
  }
  export function validateConfig(
    configType: "global" | "inherit" | "repo",
    config: RenovateConfig,
    isPreset?: boolean,
    parentPath?: string,
  ): Promise<{ errors: ValidationMessage[]; warnings: ValidationMessage[] }>;
}

declare module "renovate/dist/config/presets/index.js" {
  export function resolveConfigPresets(
    inputConfig: RenovateConfig,
    baseConfig?: RenovateConfig,
    ignorePresets?: string[],
    existingPresets?: string[],
    mergeInternalPresets?: boolean,
  ): Promise<{
    config: RenovateConfig;
    visitedPresets: { merged: string[]; unmerged: string[] };
  }>;
}

declare module "renovate/dist/config/presets/parse.js" {
  export interface ParsedPreset {
    presetSource: string;
    repo?: string;
    presetPath?: string;
    presetName?: string;
    tag?: string;
    params?: string[];
    rawParams?: string;
  }
  /** Throws on syntactically invalid preset strings. */
  export function parsePreset(input: string): ParsedPreset;
}

declare module "renovate/dist/config/presets/internal/index.js" {
  /** Renovate's own bundled presets, keyed by `repo` (the part before the `:`)
   *  and `presetName`. Synchronous — internal presets are data in `dist`, not
   *  a fetch. `undefined` when the pair names no bundled preset. */
  export function getPreset(config: {
    repo?: string;
    presetName?: string;
  }): RenovateConfig | undefined;
  /** The table those presets live in, keyed by group then preset name. These
   *  are the very objects `getPreset` hands out — `config/presets/index.js`
   *  MUTATES them (see trace/description-provenance.ts), so treat as read-only
   *  and never assume a body is still what its author wrote. */
  export const groups: Record<string, Record<string, RenovateConfig>>;
}

declare module "renovate/dist/config/presets/util.js" {
  export const PRESET_DEP_NOT_FOUND: string;
  export const PRESET_INVALID: string;
  export const PRESET_INVALID_JSON: string;
  export const PRESET_NOT_FOUND: string;
  export const PRESET_PROHIBITED_SUBPRESET: string;
  export const PRESET_RENOVATE_CONFIG_NOT_FOUND: string;
  export function fetchPreset(opts: {
    repo: string;
    filePreset: string;
    presetPath?: string;
    endpoint: string;
    tag?: string;
    fetch: (
      repo: string,
      fileName: string,
      endpoint: string,
      tag?: string,
    ) => Promise<Record<string, unknown> | null>;
  }): Promise<Record<string, unknown> | null>;
  export function parsePreset(content: string, fileName: string): Record<string, unknown>;
}

declare module "renovate/dist/config/inherit.js" {
  // Renovate ships this as a class with only static members; modelled here as
  // a namespace so callers get the same `InheritConfig.set(...)` access
  // without an extraneous-class lint warning.
  export namespace InheritConfig {
    const OPTIONS: readonly string[];
    function get(key: string): unknown;
    /** Captures the inherit-supported options into module state and RETURNS the config with them stripped. */
    function set(config: RenovateConfig): RenovateConfig;
    function reset(): void;
  }
}

declare module "renovate/dist/util/package-rules/matchers.js" {
  /**
   * One instantiated matcher from Renovate's registry. `matches` returns
   * null/undefined when its clause is absent from the rule, otherwise whether
   * the input satisfies the clause (JsonataMatcher is async — always await).
   */
  export interface PackageRuleMatcher {
    matches(
      inputConfig: Record<string, unknown>,
      packageRule: Record<string, unknown>,
    ): boolean | null | undefined | Promise<boolean | null | undefined>;
  }
  /** The 18 matchers, in evaluation order. */
  const matchers: readonly PackageRuleMatcher[];
  export default matchers;
}

declare module "renovate/dist/util/package-rules/index.js" {
  export function applyPackageRules(
    inputConfig: RenovateConfig,
    stageName?: string,
  ): Promise<RenovateConfig>;
}

declare module "renovate/dist/modules/versioning/index.js" {
  /**
   * The subset of Renovate's VersioningApi the simulator's updateType
   * derivation (roadmap 015) reads. `getMajor`/`getMinor` return null when
   * the input isn't a version the scheme can parse.
   */
  export interface VersioningApi {
    isVersion(input: string | undefined | null): boolean;
    equals(version: string, other: string): boolean;
    getMajor(version: string): number | null;
    getMinor(version: string): number | null;
    isSame?(type: "major" | "minor" | "patch", a: string, b: string): boolean;
  }
  /** Looks up a versioning scheme by name; defaults to semver-coerced when
   *  omitted/null. Throws for an unregistered name, same as upstream. */
  export function get(versioning?: string | null): VersioningApi;
}

declare module "renovate/dist/workers/repository/process/lookup/update-type.js" {
  import type { VersioningApi } from "renovate/dist/modules/versioning/index.js";
  /**
   * Upstream's own major/minor/patch bucketing (`config` is accepted but
   * unused by the current implementation). Only ever returns one of these
   * three — rollback/pin/digest/bump/replacement are decided elsewhere.
   */
  export function getUpdateType(
    config: RenovateConfig,
    versioningApi: VersioningApi,
    currentVersion: string,
    newVersion: string,
  ): "major" | "minor" | "patch";
}

declare module "renovate/dist/util/cache/memory/index.js" {
  export function init(): void;
  export function reset(): void;
  export function get<T = unknown>(key: string): T;
  export function set(key: string, value: unknown): void;
}

declare module "renovate/dist/types/errors/external-host-error.js" {
  export class ExternalHostError extends Error {
    constructor(err: Error, hostType?: string);
    err: Error;
    hostType: string | undefined;
  }
}

declare module "renovate/dist/modules/datasource/api.js" {
  // The real value is `Map<name, DatasourceImplementation>`; only the key set
  // (roadmap 047's `listDatasourceNames`) is ever read through this type, so
  // the implementation is modelled as `unknown`.
  const datasources: ReadonlyMap<string, unknown>;
  export default datasources;
}

declare module "renovate/dist/modules/manager/api.js" {
  // Same shape as the datasource registry above — only the key set (roadmap
  // 047's `listManagerNames`) is ever read through this type.
  const managers: ReadonlyMap<string, unknown>;
  export default managers;
}

declare module "renovate/package.json" {
  const pkg: { name: string; version: string };
  export default pkg;
}

declare module "renovate/renovate-schema.json" {
  const schema: Record<string, unknown>;
  export default schema;
}
