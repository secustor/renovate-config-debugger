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
  | "preset-error"
  | "validation-message"
  | "log";

export interface ValidationMessage {
  topic: string;
  message: string;
}

export interface PresetSourceRef {
  /** The raw preset string as written in `extends`, e.g. `github>org/repo:preset` */
  raw?: string;
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
}
