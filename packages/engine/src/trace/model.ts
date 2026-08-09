import type { Operation } from "fast-json-patch";
import type { PresetAuth } from "../auth";

/**
 * Roadmap 033: the pipeline's stages, in execution order — the single runtime
 * source the app checks its own copies against (`satisfies typeof STAGE_IDS`
 * keeps the app's list byte-identical without a static runtime import of the
 * heavy engine chunk). Adding a stage here is what makes every restatement in
 * the app fail to compile until it is updated.
 */
export const STAGE_IDS = [
  "global",
  "inherit",
  "parse",
  "migrate",
  "massage",
  "validate",
  "preset",
  "merge",
] as const;

export type StageId = (typeof STAGE_IDS)[number];

export type StageStatus = "ok" | "error" | "skipped";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export type TraceEventKind =
  | "stage-start"
  | "stage-complete"
  | "stage-error"
  | "migration-applied"
  | "preset-fetch"
  | "preset-resolved"
  | "preset-error"
  | "validation-message"
  | "log";

export interface ValidationMessage {
  topic: string;
  message: string;
}

/**
 * Per-step detail attached to a granular `migration-applied` event (004). Each
 * step is one migration class (or one non-class post-processing block) that
 * actually changed the config; the event's before/after are full-document
 * snapshots so the stepper's diffs stay small.
 */
export interface MigrationStepInfo {
  /** Human-readable label, e.g. `packageNames → matchPackageNames`. */
  name: string;
  /** Renovate's migration class name, e.g. `PackageNameMigration`. */
  className: string;
  /** The config key this step acted on (absent for post-processing blocks). */
  key?: string;
  /** For rename migrations, the key the value moved to. */
  newKey?: string;
  /** Parent key when the step fired inside a nested object subtree. */
  parentKey?: string;
  /** Fixed-point pass this step belongs to (1 = first pass). */
  pass?: number;
  /** Set when the step fired while migrating a preset on fetch (preset stage). */
  presetName?: string;
  /** One-sentence explanation of why the old form is deprecated. */
  explanation?: string;
}

export type PresetSource =
  | "internal"
  | "github"
  | "gitlab"
  | "gitea"
  | "forgejo"
  | "local"
  | "npm"
  | "http";

export interface PresetSourceRef {
  /** The raw preset string as written in `extends`, e.g. `github>org/repo:preset` */
  raw?: string;
  presetSource?: PresetSource;
  repo?: string;
  presetPath?: string;
  presetName?: string;
  tag?: string;
  /** Positional parameters, e.g. `schedule:earlyMondays(...)` → ["..."] */
  params?: string[];
  /**
   * For `local>` / bare `owner/repo` nodes only: the platform + endpoint the
   * run resolved them against (from the platform context / global config).
   */
  platform?: string;
  endpoint?: string;
}

export type PresetNodeState =
  /** Resolution started but never finished (an error elsewhere aborted the run) */
  | "aborted"
  | "resolved"
  | "error"
  /** Listed in `ignorePresets` and skipped */
  | "ignored"
  /** Skipped because it already appears in its own ancestor chain */
  | "already-seen";

export interface PresetNode {
  id: string;
  /** Raw preset string as written in `extends`; the root node is the input config */
  name: string;
  state: PresetNodeState;
  source?: PresetSourceRef;
  /** Same preset was already resolved elsewhere in the tree (served from cache) */
  duplicate?: boolean;
  /**
   * Discovered while resolving a nested object value (e.g. `packageRules[n].extends`)
   * rather than the parent preset's own top-level `extends`.
   */
  nested?: boolean;
  error?: ValidationMessage;
  /** Content exactly as fetched from the source, before params/migration */
  fetched?: unknown;
  /** Content after `replaceArgs` parameter substitution (only when params were given) */
  afterParams?: unknown;
  /** Migrated + massaged content, the form fed into recursive resolution */
  input?: unknown;
  /** Fully resolved config (all sub-presets merged in) that merges into the parent */
  resolved?: unknown;
  children: PresetNode[];
}

export interface TraceEvent {
  id: string;
  stage: StageId;
  kind: TraceEventKind;
  title: string;
  parentId?: string;
  before?: unknown;
  after?: unknown;
  delta?: Operation[];
  source?: PresetSourceRef;
  messages?: ValidationMessage[];
  level?: LogLevel;
  meta?: unknown;
  /** Present on granular `migration-applied` events (004). */
  migration?: MigrationStepInfo;
}

export interface PipelineInput {
  /** Config file name, drives format detection (e.g. `renovate.json`, `renovate.json5`) */
  fileName: string;
  /** Raw file contents */
  content: string;
  /** Optional self-hosted/global options consulted by migration, validation and presets */
  globalConfig?: Record<string, unknown>;
  /** Optional inherited config (`inheritConfig`, 008) — a parsed JSON object. */
  inheritedConfig?: Record<string, unknown>;
  /**
   * Platform context defining `local>` resolution. Set through Renovate's real
   * GlobalConfig before preset resolution. Defaults to `github`.
   */
  platform?: string;
  /** Endpoint for the platform context; defaults to the platform's own API. */
  endpoint?: string;
  /**
   * When true, `platform`/`endpoint` above win over the global config's own
   * values (an explicit user override, 008/010); the run's platformContext is
   * then marked `overridden`.
   */
  platformOverride?: boolean;
  /**
   * User-supplied preset content for otherwise-unreachable presets, keyed by
   * the canonical injection key (see `presetInjectionKey`).
   */
  injectedPresets?: Record<string, Record<string, unknown>>;
  /**
   * The credentials THIS run's preset fetches may use. Set it and the run owns
   * its own auth: the pipeline installs it as the first step inside the
   * serialized engine queue and restores the previous module state when the
   * run ends, so concurrent callers (the MCP server holds several runs and its
   * handlers run in parallel) cannot leak one run's tokens into another run's
   * fetches — and, crucially, into an endpoint a config the caller does not
   * trust has chosen. Omit it to keep using whatever `setPresetAuth` installed
   * globally (the web app's single-run-at-a-time path).
   */
  presetAuth?: PresetAuth;
}

/** The platform + endpoint a run resolved `local>` presets against. */
export interface PlatformContext {
  platform: string;
  endpoint: string;
  /** The user explicitly overrode the global config's platform/endpoint. */
  overridden?: boolean;
}

export interface TraceResult {
  events: TraceEvent[];
  finalConfig: Record<string, unknown> | undefined;
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  renovateVersion: string;
  stageStatus: Record<StageId, StageStatus>;
  visitedPresets: { merged: string[]; unmerged: string[] };
  /**
   * Tree of `extends` resolution rooted at the input config. Reconstructed
   * from Renovate's own log stream, so it is only populated when the logger
   * shim is active (browser bundle / shimmed tests) — undefined in plain Node.
   */
  presetTree?: PresetNode;
  /** Platform + endpoint this run resolved `local>` presets against. */
  platformContext: PlatformContext;
  /**
   * The assembled merge layers of a run with global/inherited inputs (008):
   * exactly what merged between the defaults and the repo's resolved config,
   * for the provenance replay. Absent when neither layer was provided.
   */
  layerConfigs?: {
    /** Global config after migrate/massage/`globalExtends` resolution, minus the options `GlobalConfig.set` captures. */
    globalResolved?: Record<string, unknown>;
    /** Inherited config after migrate/massage/preset resolution, minus global-only and `InheritConfig`-captured options. */
    inheritedResolved?: Record<string, unknown>;
  };
  /**
   * Injection keys served from user-supplied content during this run. The app
   * matches these against each node's computed key to flag "user-supplied".
   */
  usedInjections: string[];
}
