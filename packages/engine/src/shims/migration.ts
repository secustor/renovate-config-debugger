/**
 * Instrumented fork of renovate/dist/config/migration.js (`migrateConfig`).
 *
 * The vite shim plugin maps `config/migration.js` here so the browser bundle
 * and the shimmed Vitest project run this file in place of Renovate's own. The
 * CONTROL FLOW is copied line-for-line from upstream and its RETURN VALUE is
 * byte-identical — the shimmed-vs-golden `finalConfig` assertion is the
 * fidelity net, so this must never diverge. The only additions are:
 *   - `runMigrations` replaces the single `MigrationsService.run(...)` call
 *     with a per-key instrumented version that uses Renovate's REAL
 *     `getMigrations` / `getMigration` (never re-listing the registry) and
 *     emits one step per migration that actually changed something.
 *   - synthetic named steps around each non-class post-processing block.
 * Every step carries a full-document before/after snapshot (a shared
 * {root, path} context is threaded through the recursion), so the stepper's
 * diffs stay small.
 *
 * When Renovate bumps, re-diff this against the upstream source — the golden
 * drift tripwire test hashes it and will fail until re-checked.
 */
import {
  clone,
  getOptions,
  mergeChildConfig,
  MigrationsService,
  regEx,
} from "./renovate-internals";
import { emitMigrationStep } from "../trace/collector";
import {
  dequal,
  isArray,
  isBoolean,
  isNonEmptyArray,
  isNonEmptyObject,
  isObject,
  isString,
} from "./renovate-deps";

// Loosely typed to mirror upstream's JS; the return value fidelity is enforced
// by the golden snapshots, not by these internal types.
// `unknown` here would demand a cast at every property read in this
// line-by-line port, obscuring the diff against upstream that keeping it
// recognizable is for.
// oxlint-disable-next-line no-explicit-any -- see above
type AnyConfig = Record<string, any>;

const options = getOptions();

export function fixShortHours(input: string): string {
  return input.replace(regEx(/( \d?\d)((a|p)m)/g), "$1:00$2");
}

/** Shared, mutable full-document context threaded through the recursion. */
interface MigCtx {
  /** Outermost migratedConfig of the current fixed-point pass. */
  root: AnyConfig | undefined;
  /** Position of the current subtree within `root`. */
  path: (string | number)[];
  /** Fixed-point pass number (1 = first pass). */
  pass: number;
}

/** Full-document snapshot: `root` cloned with `subtree` spliced in at `path`. */
function fullDoc(ctx: MigCtx, subtree: unknown): unknown {
  if (ctx.path.length === 0 || ctx.root === undefined) {
    return clone(subtree);
  }
  const doc = clone(ctx.root) as AnyConfig;
  let cursor: unknown = doc;
  for (let i = 0; i < ctx.path.length - 1; i++) {
    if (cursor === null || typeof cursor !== "object") {
      return clone(subtree);
    }
    cursor = (cursor as AnyConfig)[String(ctx.path[i])];
  }
  if (cursor === null || typeof cursor !== "object") {
    return clone(subtree);
  }
  (cursor as AnyConfig)[String(ctx.path[ctx.path.length - 1])] = clone(subtree);
  return doc;
}

/** Apply the key-level diff between two migratedConfig snapshots to `work`. */
function applyKeyDiff(work: AnyConfig, before: AnyConfig, after: AnyConfig): void {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (dequal(before[key], after[key])) {
      continue;
    }
    if (key in after) {
      work[key] = clone(after[key]);
    } else {
      delete work[key];
    }
  }
}

/**
 * Faithful re-implementation of `MigrationsService.run` (each migration mutates
 * a shared `migratedConfig`), instrumented to emit one step per migration whose
 * `run` + deprecated-delete actually changed the shared object. `work` mirrors
 * the eventual full subtree so each step's before/after are complete documents.
 */
function runMigrations(
  originalConfig: AnyConfig,
  parentKey: string | undefined,
  ctx: MigCtx,
): AnyConfig {
  const migratedConfig: AnyConfig = {};
  const migrations = MigrationsService.getMigrations(originalConfig, migratedConfig);
  const work: AnyConfig = clone(originalConfig);
  for (const [key, value] of Object.entries(originalConfig)) {
    migratedConfig[key] ??= value;
    const migration = MigrationsService.getMigration(migrations, key);
    if (migration) {
      const before = clone(migratedConfig);
      migration.run(value, key, parentKey);
      if (migration.deprecated) {
        delete migratedConfig[key];
      }
      const after = clone(migratedConfig);
      if (!dequal(before, after)) {
        const workBefore = clone(work);
        applyKeyDiff(work, before, after);
        emitMigrationStep({
          className: migration.constructor.name,
          key,
          newKey:
            typeof migration.newPropertyName === "string" ? migration.newPropertyName : undefined,
          parentKey,
          pass: ctx.pass,
          before: fullDoc(ctx, workBefore),
          after: fullDoc(ctx, work),
        });
      }
    }
  }
  return migratedConfig;
}

/** Emit a synthetic post-processing step if the block changed the subtree. */
function emitPostStep(
  ctx: MigCtx,
  className: string,
  before: AnyConfig,
  after: AnyConfig,
  parentKey: string | undefined,
): void {
  if (dequal(before, after)) {
    return;
  }
  emitMigrationStep({
    className,
    parentKey,
    pass: ctx.pass,
    before: fullDoc(ctx, before),
    after: fullDoc(ctx, after),
  });
}

let optionTypes: Record<string, string> | undefined;

interface MigrationResult {
  isMigrated: boolean;
  migratedConfig: AnyConfig;
}

export function migrateConfig(
  config: AnyConfig,
  parentKey?: string,
  ctx?: MigCtx,
): MigrationResult {
  if (!optionTypes) {
    optionTypes = {};
    for (const option of options) {
      optionTypes[option.name] = option.type;
    }
  }
  const activeCtx: MigCtx = ctx ?? { root: undefined, path: [], pass: 1 };
  const newConfig = runMigrations(config, parentKey, activeCtx);
  const migratedConfig = clone(newConfig);
  // For nested calls `root` is the ancestor's top-level object; at the top of
  // a pass it is this call's own migratedConfig (path is []).
  const root = activeCtx.root ?? migratedConfig;
  const basePath = activeCtx.path;
  for (const [key, val] of Object.entries(newConfig)) {
    // Per-key value normalization (template rewrites + optionType coercions).
    // Recursion into arrays/objects is threaded (it emits its own steps), so
    // only the non-recursive branches produce a synthetic per-key step.
    const keyBefore = clone(migratedConfig[key]);
    let stepClass: string | undefined;
    let recursed = false;
    if (isString(val) && val.includes("{{baseDir}}")) {
      migratedConfig[key] = val.replace(regEx(/{{baseDir}}/g), "{{packageFileDir}}");
      stepClass = "TemplateRewrite";
    } else if (isString(val) && val.includes("{{lookupName}}")) {
      migratedConfig[key] = val.replace(regEx(/{{lookupName}}/g), "{{packageName}}");
      stepClass = "TemplateRewrite";
    } else if (isString(val) && val.includes("{{depNameShort}}")) {
      migratedConfig[key] = val.replace(regEx(/{{depNameShort}}/g), "{{depName}}");
      stepClass = "TemplateRewrite";
    } else if (isString(val) && val.startsWith("{{semanticPrefix}}")) {
      migratedConfig[key] = val.replace(
        "{{semanticPrefix}}",
        "{{#if semanticCommitType}}{{semanticCommitType}}{{#if semanticCommitScope}}({{semanticCommitScope}}){{/if}}: {{/if}}",
      );
      stepClass = "TemplateRewrite";
    } else if (optionTypes[key] === "object" && isBoolean(val)) {
      migratedConfig[key] = { enabled: val };
      stepClass = "OptionTypeCoercion";
    } else if (optionTypes[key] === "boolean") {
      if (val === "true") {
        migratedConfig[key] = true;
        stepClass = "OptionTypeCoercion";
      } else if (val === "false") {
        migratedConfig[key] = false;
        stepClass = "OptionTypeCoercion";
      }
    } else if (optionTypes[key] === "string" && isArray(val) && val.length === 1) {
      migratedConfig[key] = String(val[0]);
      stepClass = "OptionTypeCoercion";
    } else if (isArray(val)) {
      // v8 ignore else -- upstream parity
      if (isArray(migratedConfig?.[key])) {
        const newArray = [];
        let index = 0;
        for (const item of migratedConfig[key]) {
          if (isObject(item) && !isArray(item)) {
            const arrMigrate = migrateConfig(item, undefined, {
              root,
              path: [...basePath, key, index],
              pass: activeCtx.pass,
            });
            newArray.push(arrMigrate.migratedConfig);
          } else {
            newArray.push(item);
          }
          index++;
        }
        migratedConfig[key] = newArray;
        recursed = true;
      }
    } else if (isObject(val)) {
      const subMigrate = migrateConfig(migratedConfig[key], key, {
        root,
        path: [...basePath, key],
        pass: activeCtx.pass,
      });
      if (subMigrate.isMigrated) {
        migratedConfig[key] = subMigrate.migratedConfig;
      }
      recursed = true;
    }
    const migratedTemplates: Record<string, string> = {
      fromVersion: "currentVersion",
      newValueMajor: "newMajor",
      newValueMinor: "newMinor",
      newVersionMajor: "newMajor",
      newVersionMinor: "newMinor",
      toVersion: "newVersion",
    };
    if (isString(migratedConfig[key])) {
      for (const [from, to] of Object.entries(migratedTemplates)) {
        migratedConfig[key] = migratedConfig[key].replace(regEx(from, "g"), to);
      }
    }
    if (!recursed && !dequal(keyBefore, migratedConfig[key])) {
      emitMigrationStep({
        className: stepClass ?? "TemplateRewrite",
        key,
        parentKey,
        pass: activeCtx.pass,
        before: fullDoc(activeCtx, cloneWithKey(migratedConfig, key, keyBefore)),
        after: fullDoc(activeCtx, clone(migratedConfig)),
      });
    }
  }
  const languageBefore = clone(migratedConfig);
  for (const language of [
    "docker",
    "dotnet",
    "golang",
    "java",
    "js",
    "node",
    "php",
    "python",
    "ruby",
    "rust",
  ]) {
    if (isNonEmptyObject(migratedConfig[language])) {
      migratedConfig.packageRules ??= [];
      const currentContent = migratedConfig[language];
      const packageRule = { matchCategories: [language], ...currentContent };
      migratedConfig.packageRules.unshift(packageRule);
      delete migratedConfig[language];
    }
  }
  emitPostStep(activeCtx, "LanguagePackageRules", languageBefore, migratedConfig, parentKey);

  const flattenBefore = clone(migratedConfig);
  if (isNonEmptyArray(migratedConfig.packageRules)) {
    const existingRules = migratedConfig.packageRules;
    migratedConfig.packageRules = [];
    for (const packageRule of existingRules) {
      if (isArray(packageRule.packageRules)) {
        for (const subrule of packageRule.packageRules) {
          const combinedRule = mergeChildConfig(packageRule, subrule);
          delete combinedRule.packageRules;
          migratedConfig.packageRules.push(combinedRule);
        }
      } else {
        migratedConfig.packageRules.push(packageRule);
      }
    }
  }
  emitPostStep(activeCtx, "FlattenNestedPackageRules", flattenBefore, migratedConfig, parentKey);

  const pipBefore = clone(migratedConfig);
  if (
    isNonEmptyObject(migratedConfig["pip-compile"]) &&
    isNonEmptyArray(migratedConfig["pip-compile"].managerFilePatterns)
  ) {
    migratedConfig["pip-compile"].managerFilePatterns = migratedConfig[
      "pip-compile"
    ].managerFilePatterns.map((filePattern: string) => {
      const pattern = filePattern;
      if (pattern.endsWith(".in")) {
        return pattern.replace(/\.in$/, ".txt");
      }
      if (pattern.endsWith(".in/")) {
        return pattern.replace(/\.in\/$/, ".txt/");
      }
      return pattern.replace(/\.in\$\/$/, ".txt$/");
    });
  }
  emitPostStep(activeCtx, "PipCompileFilePatterns", pipBefore, migratedConfig, parentKey);

  const gradleManagersBefore = clone(migratedConfig);
  if (
    isNonEmptyArray(migratedConfig.matchManagers) &&
    migratedConfig.matchManagers.includes("gradle-lite")
  ) {
    // v8 ignore else -- upstream parity
    if (!migratedConfig.matchManagers.includes("gradle")) {
      migratedConfig.matchManagers.push("gradle");
    }
    migratedConfig.matchManagers = migratedConfig.matchManagers.filter(
      (manager: string) => manager !== "gradle-lite",
    );
  }
  emitPostStep(activeCtx, "GradleLiteManager", gradleManagersBefore, migratedConfig, parentKey);

  const gradleBefore = clone(migratedConfig);
  if (isNonEmptyObject(migratedConfig["gradle-lite"])) {
    migratedConfig.gradle = mergeChildConfig(
      migratedConfig.gradle ?? {},
      migratedConfig["gradle-lite"],
    );
  }
  delete migratedConfig["gradle-lite"];
  emitPostStep(activeCtx, "GradleLiteMerge", gradleBefore, migratedConfig, parentKey);

  const isMigrated = !dequal(config, migratedConfig);
  if (isMigrated) {
    return {
      isMigrated,
      migratedConfig: migrateConfig(migratedConfig, undefined, {
        root: undefined,
        path: [],
        pass: activeCtx.pass + 1,
      }).migratedConfig,
    };
  }
  return { isMigrated, migratedConfig };
}

/** Clone of `config` with one key replaced by `value` (for per-key before). */
function cloneWithKey(config: AnyConfig, key: string, value: unknown): AnyConfig {
  const copy = clone(config);
  copy[key] = clone(value);
  return copy;
}
