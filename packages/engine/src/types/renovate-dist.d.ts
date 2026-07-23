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

declare module "renovate/package.json" {
  const pkg: { name: string; version: string };
  export default pkg;
}

declare module "renovate/renovate-schema.json" {
  const schema: Record<string, unknown>;
  export default schema;
}
