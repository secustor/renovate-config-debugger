import {
  getDefaultConfig,
  GlobalConfig,
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
  const platform =
    (typeof globalConfig.platform === "string" ? globalConfig.platform : undefined) ??
    input.platform ??
    "github";
  const endpoint =
    (typeof globalConfig.endpoint === "string" ? globalConfig.endpoint : undefined) ??
    input.endpoint ??
    ENDPOINT_DEFAULTS[platform] ??
    "";
  return { platform, endpoint };
}

// Renovate's config modules hold module-level state (GlobalConfig, memCache,
// the active trace collector), so runs must never overlap.
let queue: Promise<unknown> = Promise.resolve();

export function runPipeline(input: PipelineInput): Promise<TraceResult> {
  const run = queue.then(() => execute(input));
  queue = run.catch(() => undefined);
  return run;
}

async function execute(input: PipelineInput): Promise<TraceResult> {
  const platformContext = resolvePlatformContext(input);
  const collector = new TraceCollector(parsePreset, platformContext);
  setCurrentCollector(collector);

  const stageStatus: Record<StageId, StageStatus> = {
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
  });

  try {
    memCache.init();
    setInjectedPresets(input.injectedPresets);
    // Platform context defines `local>`; the pasted global config (008) still
    // wins over the explicit options, matching how a real run is configured.
    GlobalConfig.set({
      platform: platformContext.platform,
      endpoint: platformContext.endpoint,
      ...input.globalConfig,
    } as Parameters<typeof GlobalConfig.set>[0]);

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

    // merge with defaults
    collector.enterStage("merge");
    collector.emit({ kind: "stage-start", title: "Merge onto default config" });
    const defaults = getDefaultConfig() as Record<string, unknown>;
    finalConfig = mergeChildConfig(defaults, config);
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
    memCache.reset();
    resetInjectedPresets();
    setCurrentCollector(null);
  }
}

function describeError(err: unknown): ValidationMessage {
  if (err && typeof err === "object" && "validationError" in err) {
    const e = err as { validationError?: string; validationMessage?: string; message?: string };
    return {
      topic: e.validationError ?? "Preset resolution failed",
      message: e.validationMessage ?? e.message ?? String(err),
    };
  }
  return {
    topic: "Preset resolution failed",
    message: err instanceof Error ? err.message : String(err),
  };
}
