import type { Operation } from "fast-json-patch";

export type StageId = "parse" | "migrate" | "massage" | "validate" | "preset" | "merge";

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
}

export interface PipelineInput {
  /** Config file name, drives format detection (e.g. `renovate.json`, `renovate.json5`) */
  fileName: string;
  /** Raw file contents */
  content: string;
  /** Optional self-hosted/global options consulted by migration, validation and presets */
  globalConfig?: Record<string, unknown>;
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
}
