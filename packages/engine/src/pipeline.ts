import {
  getDefaultConfig,
  getOptions,
  GlobalConfig,
  InheritConfig,
  massageConfig,
  memCache,
  mergeChildConfig,
  migrateConfig,
  parseFileConfig,
  parsePreset,
  resolveConfigPresets,
  validateConfig,
} from "./renovate-adapter";
import {
  getUsedInjectionKeys,
  resetInjectedPresets,
  setInjectedPresets,
} from "./shims/presets/injection";
import { setCurrentCollector, TraceCollector } from "./trace/collector";
import { computeDelta, snapshot } from "./trace/delta";
import type {
  PipelineInput,
  PlatformContext,
  StageId,
  StageStatus,
  TraceResult,
  ValidationMessage,
} from "./trace/model";
import { renovateVersion } from "./version";

/** Default browser endpoint per platform, for display + when none is given. */
const ENDPOINT_DEFAULTS: Record<string, string> = {
  github: "https://api.github.com/",
  gitlab: "https://gitlab.com/api/v4/",
  gitea: "https://gitea.com/",
  forgejo: "https://codeberg.org/",
};

function resolvePlatformContext(input: PipelineInput): PlatformContext {
  const globalConfig = input.globalConfig ?? {};
  const globalPlatform =
    typeof globalConfig.platform === "string" ? globalConfig.platform : undefined;
  const globalEndpoint =
    typeof globalConfig.endpoint === "string" ? globalConfig.endpoint : undefined;
  // An override only exists relative to global-config values (008/010).
  const overridden =
    input.platformOverride === true &&
    (globalPlatform !== undefined || globalEndpoint !== undefined);
  const platform =
    (overridden ? (input.platform ?? globalPlatform) : (globalPlatform ?? input.platform)) ??
    "github";
  // Without an override, a global-config platform also invalidates the
  // explicit endpoint — it belongs to the toolbar's platform, not this one; a
  // real run would use the global endpoint or the platform's own default.
  const explicitEndpoint =
    !overridden && globalPlatform !== undefined && globalEndpoint === undefined
      ? undefined
      : input.endpoint;
  const endpoint =
    (overridden ? (explicitEndpoint ?? globalEndpoint) : (globalEndpoint ?? explicitEndpoint)) ??
    ENDPOINT_DEFAULTS[platform] ??
    "";
  return overridden ? { platform, endpoint, overridden } : { platform, endpoint };
}

/**
 * Renovate's `removeGlobalConfig` (dist/config/index.js) reimplemented — the
 * upstream module also drags the full modules/manager graph (100+ Node-only
 * manager modules) into any bundle that imports it, so the visualizer keeps
 * this pure 7-line getOptions() loop local instead of deep-importing it.
 */
function removeGlobalConfig(
  config: Record<string, unknown>,
  keepInherited: boolean,
): Record<string, unknown> {
  const outputConfig = { ...config };
  for (const option of getOptions()) {
    if (keepInherited && option.inheritConfigSupport) {
      continue;
    }
    if (option.globalOnly) {
      delete outputConfig[option.name];
    }
  }
  return outputConfig;
}

// Renovate's config modules hold module-level state (GlobalConfig, memCache,
// the active trace collector), so runs must never overlap.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Serializes every engine entry point that touches renovate's stateful
 * modules through one queue, so e.g. a packageRules simulation (006) never
 * interleaves with a pipeline run.
 */
export function enqueueEngineTask<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(() => task());
  queue = run.catch(() => undefined);
  return run;
}

export function runPipeline(input: PipelineInput): Promise<TraceResult> {
  return enqueueEngineTask(() => execute(input));
}

async function execute(input: PipelineInput): Promise<TraceResult> {
  const platformContext = resolvePlatformContext(input);
  const collector = new TraceCollector(parsePreset, platformContext);
  setCurrentCollector(collector);

  const stageStatus: Record<StageId, StageStatus> = {
    global: "skipped",
    inherit: "skipped",
    parse: "skipped",
    migrate: "skipped",
    massage: "skipped",
    validate: "skipped",
    preset: "skipped",
    merge: "skipped",
  };
  const errors: ValidationMessage[] = [];
  const warnings: ValidationMessage[] = [];
  let visitedPresets: TraceResult["visitedPresets"] = { merged: [], unmerged: [] };
  let finalConfig: Record<string, unknown> | undefined;
  // Assembled 008 merge layers; undefined = layer absent or failed validation.
  let globalLayer: Record<string, unknown> | undefined;
  let inheritedLayer: Record<string, unknown> | undefined;

  const result = (): TraceResult => ({
    events: collector.events,
    finalConfig,
    errors,
    warnings,
    renovateVersion,
    stageStatus,
    visitedPresets,
    presetTree: collector.finalizePresetTree(),
    platformContext,
    usedInjections: getUsedInjectionKeys(),
    ...(globalLayer || inheritedLayer
      ? {
          layerConfigs: {
            ...(globalLayer ? { globalResolved: snapshot(globalLayer) } : {}),
            ...(inheritedLayer ? { inheritedResolved: snapshot(inheritedLayer) } : {}),
          },
        }
      : {}),
  });

  try {
    memCache.init();
    setInjectedPresets(input.injectedPresets);
    // Platform context defines `local>`. It already accounts for the pasted
    // global config (008) — its values win unless explicitly overridden — so
    // the resolved context is authoritative here.
    GlobalConfig.set({
      ...input.globalConfig,
      platform: platformContext.platform,
      endpoint: platformContext.endpoint,
    } as Parameters<typeof GlobalConfig.set>[0]);

    const defaults = getDefaultConfig() as Record<string, unknown>;

    // global config layer (008) — upstream workers/global/config/parse order:
    // migrate/massage/validate, resolve globalExtends UNDER the config, then
    // GlobalConfig.set captures the ~55 global-context options; the remainder
    // it returns is what merges into the repo-level run config.
    if (input.globalConfig) {
      collector.enterStage("global");
      collector.emit({ kind: "stage-start", title: "Assemble global (self-hosted) config" });
      const rawGlobal = snapshot(input.globalConfig);
      let globalCfg = migrateConfig(snapshot(rawGlobal)).migratedConfig;
      globalCfg = massageConfig(globalCfg);
      const globalValidation = await validateConfig("global", globalCfg);
      errors.push(...globalValidation.errors);
      warnings.push(...globalValidation.warnings);
      emitValidationMessages(collector, globalValidation);
      stageStatus.global = globalValidation.errors.length > 0 ? "error" : "ok";
      if (Array.isArray(globalCfg.globalExtends) && globalCfg.globalExtends.length > 0) {
        try {
          // upstream resolveGlobalExtends: presets merge UNDER the config
          const { config: resolvedExtends } = await resolveConfigPresets({
            extends: globalCfg.globalExtends,
            ignorePresets: globalCfg.ignorePresets,
          });
          globalCfg = mergeChildConfig(resolvedExtends, globalCfg);
        } catch (err) {
          stageStatus.global = "error";
          const message = describeError(err, "globalExtends resolution failed");
          errors.push(message);
          collector.emit({ kind: "stage-error", title: message.message, messages: [message] });
        }
        delete globalCfg.globalExtends;
      }
      // Re-capture with the fully assembled config (globalExtends may set
      // captured options); the platform context stays authoritative.
      globalLayer = GlobalConfig.set({
        ...globalCfg,
        platform: platformContext.platform,
        endpoint: platformContext.endpoint,
      } as Parameters<typeof GlobalConfig.set>[0]) as Record<string, unknown>;
      collector.emit({
        kind: "stage-complete",
        title: "Global config layer assembled",
        before: rawGlobal,
        after: snapshot(globalLayer),
        delta: computeDelta(rawGlobal, globalLayer),
      });
    }

    // inherited config layer (008) — the upstream mergeInheritedConfig recipe
    // minus platform fetch/decrypt/templating: validate("inherit") (errors
    // exclude the layer, as upstream aborts), strip global-only options with
    // keepInherited semantics, resolve presets, validate again, strip again,
    // then InheritConfig.set captures its options and returns the remainder.
    if (input.inheritedConfig) {
      collector.enterStage("inherit");
      collector.emit({ kind: "stage-start", title: "Merge inherited config (inheritConfig)" });
      const rawInherited = snapshot(input.inheritedConfig);
      let inheritedCfg = migrateConfig(snapshot(rawInherited)).migratedConfig;
      inheritedCfg = massageConfig(inheritedCfg);
      const inheritValidation = await validateConfig("inherit", inheritedCfg);
      errors.push(...inheritValidation.errors);
      warnings.push(...inheritValidation.warnings);
      emitValidationMessages(collector, inheritValidation);
      if (inheritValidation.errors.length > 0) {
        stageStatus.inherit = "error";
        collector.emit({
          kind: "stage-error",
          title: "Inherited config failed validation — layer not merged",
          messages: inheritValidation.errors,
        });
      } else {
        try {
          let filtered: Record<string, unknown> | undefined = removeGlobalConfig(
            inheritedCfg,
            true,
          );
          if (filtered.extends != null) {
            // upstream resolves against the run config assembled so far
            const base = mergeChildConfig(snapshot(defaults), snapshot(globalLayer ?? {}));
            const { config: resolved } = await resolveConfigPresets(
              filtered,
              base,
              base.ignorePresets as string[] | undefined,
            );
            const resolvedValidation = await validateConfig("inherit", resolved);
            errors.push(...resolvedValidation.errors);
            warnings.push(...resolvedValidation.warnings);
            emitValidationMessages(collector, resolvedValidation);
            if (resolvedValidation.errors.length > 0) {
              stageStatus.inherit = "error";
              collector.emit({
                kind: "stage-error",
                title: "Presets inside the inherited config failed validation — layer not merged",
                messages: resolvedValidation.errors,
              });
              filtered = undefined;
            } else {
              filtered = removeGlobalConfig(resolved, true);
            }
          }
          if (filtered) {
            inheritedLayer = InheritConfig.set(filtered);
            stageStatus.inherit = "ok";
            collector.emit({
              kind: "stage-complete",
              title: "Inherited config layer assembled",
              before: rawInherited,
              after: snapshot(inheritedLayer),
              delta: computeDelta(rawInherited, inheritedLayer),
            });
          }
        } catch (err) {
          stageStatus.inherit = "error";
          const message = describeError(err, "Inherited config preset resolution failed");
          errors.push(message);
          collector.emit({ kind: "stage-error", title: message.message, messages: [message] });
        }
      }
    }

    // parse
    collector.enterStage("parse");
    collector.emit({ kind: "stage-start", title: `Parse ${input.fileName}` });
    const parsed = parseFileConfig(input.fileName, input.content);
    if (!parsed.success) {
      stageStatus.parse = "error";
      const message = { topic: parsed.validationError, message: parsed.validationMessage };
      errors.push(message);
      collector.emit({ kind: "stage-error", title: parsed.validationError, messages: [message] });
      return result();
    }
    let config = snapshot(parsed.parsedContents) as Record<string, unknown>;
    stageStatus.parse = "ok";
    collector.emit({ kind: "stage-complete", title: "Parsed config", after: snapshot(config) });

    // migrate
    collector.enterStage("migrate");
    collector.emit({ kind: "stage-start", title: "Migrate deprecated options" });
    const before = snapshot(config);
    // migrateConfig (shimmed to src/shims/migration.ts) emits one granular
    // `migration-applied` event per migration/post-processing block that
    // changed something, during this call. The stage-complete event below
    // still carries the whole-stage before/after as the fallback blob view.
    const { isMigrated, migratedConfig } = migrateConfig(config);
    config = migratedConfig;
    stageStatus.migrate = "ok";
    collector.emit({
      kind: "stage-complete",
      title: isMigrated ? "Migrations applied" : "Nothing to migrate",
      before,
      after: snapshot(config),
      delta: computeDelta(before, config),
    });

    // massage
    collector.enterStage("massage");
    collector.emit({ kind: "stage-start", title: "Massage config into canonical form" });
    const preMassage = snapshot(config);
    config = massageConfig(config);
    stageStatus.massage = "ok";
    collector.emit({
      kind: "stage-complete",
      title: "Massaged config",
      before: preMassage,
      after: snapshot(config),
      delta: computeDelta(preMassage, config),
    });

    // validate
    collector.enterStage("validate");
    collector.emit({ kind: "stage-start", title: "Validate config" });
    const validation = await validateConfig("repo", config);
    errors.push(...validation.errors);
    warnings.push(...validation.warnings);
    emitValidationMessages(collector, validation);
    stageStatus.validate = validation.errors.length > 0 ? "error" : "ok";
    collector.emit({
      kind: "stage-complete",
      title: `Validation finished: ${validation.errors.length} error(s), ${validation.warnings.length} warning(s)`,
    });

    // presets
    collector.enterStage("preset");
    collector.emit({ kind: "stage-start", title: "Resolve extends presets" });
    const preResolve = snapshot(config);
    try {
      const resolved = await resolveConfigPresets(config);
      config = resolved.config;
      visitedPresets = resolved.visitedPresets;
      stageStatus.preset = "ok";
      collector.emit({
        kind: "stage-complete",
        title: `Resolved ${resolved.visitedPresets.merged.length} preset(s)`,
        before: preResolve,
        after: snapshot(config),
        delta: computeDelta(preResolve, config),
      });
    } catch (err) {
      stageStatus.preset = "error";
      const message = describeError(err);
      errors.push(message);
      collector.emit({ kind: "stage-error", title: message.message, messages: [message] });
      config = preResolve;
    }

    // merge with defaults (and, when present, the 008 layers in between:
    // defaults → global remainder → inherited remainder → repo config)
    collector.enterStage("merge");
    collector.emit({ kind: "stage-start", title: "Merge onto default config" });
    let base = defaults;
    if (globalLayer) {
      base = mergeChildConfig(snapshot(base), snapshot(globalLayer));
    }
    if (inheritedLayer) {
      base = mergeChildConfig(snapshot(base), snapshot(inheritedLayer));
    }
    finalConfig = mergeChildConfig(base, config);
    stageStatus.merge = "ok";
    collector.emit({
      kind: "stage-complete",
      title: "Effective config",
      before: snapshot(defaults),
      after: snapshot(finalConfig),
      delta: computeDelta(defaults, finalConfig),
    });

    return result();
  } finally {
    GlobalConfig.reset();
    InheritConfig.reset();
    memCache.reset();
    resetInjectedPresets();
    setCurrentCollector(null);
  }
}

function emitValidationMessages(
  collector: TraceCollector,
  validation: { errors: ValidationMessage[]; warnings: ValidationMessage[] },
): void {
  for (const error of validation.errors) {
    collector.emit({
      kind: "validation-message",
      title: error.message,
      level: "error",
      messages: [error],
    });
  }
  for (const warning of validation.warnings) {
    collector.emit({
      kind: "validation-message",
      title: warning.message,
      level: "warn",
      messages: [warning],
    });
  }
}

function describeError(err: unknown, topic = "Preset resolution failed"): ValidationMessage {
  if (err && typeof err === "object" && "validationError" in err) {
    const e = err as { validationError?: string; validationMessage?: string; message?: string };
    return {
      topic: e.validationError ?? topic,
      message: e.validationMessage ?? e.message ?? String(err),
    };
  }
  return {
    topic,
    message: err instanceof Error ? err.message : String(err),
  };
}
