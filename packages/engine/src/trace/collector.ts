import { computeDelta, snapshot, toSerializable } from "./delta";
import { describeMigration } from "./migration-names";
import type { LogLevel, PlatformContext, PresetNode, StageId, TraceEvent } from "./model";
import { type ParsePresetFn, PresetTreeBuilder } from "./preset-tree";

/**
 * One granular migration step reported by the forked `migrateConfig` shim
 * (004). `before`/`after` are full-document snapshots at the point the step
 * fired; the collector turns them into a `migration-applied` event.
 */
export interface MigrationStepEmit {
  /** Migration class name, or a synthetic post-processing block name. */
  className: string;
  key?: string;
  /** For rename migrations, the key the value moved to. */
  newKey?: string;
  parentKey?: string;
  pass: number;
  before: unknown;
  after: unknown;
}

/**
 * Collects trace events for the currently running pipeline. The logger shim
 * forwards every Renovate log call here, which is what turns Renovate's own
 * logging into trace events without touching its code.
 */
export class TraceCollector {
  readonly events: TraceEvent[] = [];
  private counter = 0;
  private stage: StageId = "parse";
  private tree: PresetTreeBuilder;

  constructor(parsePreset?: ParsePresetFn, platformContext?: PlatformContext) {
    this.tree = new PresetTreeBuilder((event) => this.emit(event), parsePreset, platformContext);
  }

  enterStage(stage: StageId): void {
    this.stage = stage;
  }

  finalizePresetTree(): PresetNode | undefined {
    return this.tree.finalize();
  }

  emit(event: Omit<TraceEvent, "id" | "stage"> & { stage?: StageId }): TraceEvent {
    const full: TraceEvent = {
      ...event,
      id: `e${++this.counter}`,
      stage: event.stage ?? this.stage,
    };
    this.events.push(full);
    return full;
  }

  /**
   * Entry point for the forked `migrateConfig` shim. Emits one granular
   * `migration-applied` event per step. Stage-gated to migrate/preset so the
   * migrateConfig calls Renovate makes during validation (packageRule
   * deprecation checks) don't pollute the stream — the same gating the preset
   * tree uses.
   */
  onMigrationStep(step: MigrationStepEmit): void {
    if (this.stage !== "migrate" && this.stage !== "preset") {
      return;
    }
    const { name, explanation } = describeMigration({
      className: step.className,
      key: step.key,
      newKey: step.newKey,
    });
    const before = snapshot(step.before);
    const after = snapshot(step.after);
    const presetName = this.stage === "preset" ? this.tree.currentPresetName() : undefined;
    this.emit({
      kind: "migration-applied",
      title: name,
      before,
      after,
      delta: computeDelta(before, after),
      migration: {
        name,
        className: step.className,
        key: step.key,
        newKey: step.newKey,
        parentKey: step.parentKey,
        pass: step.pass,
        presetName,
        explanation,
      },
    });
  }

  /** Entry point for the logger shim. Upgrades known messages to typed events. */
  onLog(level: LogLevel, meta: unknown, msg: string | undefined): void {
    // The tree builder only sees the preset stage: validateConfig also calls
    // resolveConfigPresets (for packageRules entries), which would otherwise
    // pollute the tree with validation-time resolutions.
    if (this.stage === "preset" && this.tree.onLog(meta, msg)) {
      return;
    }
    const metaObj = (meta ?? {}) as Record<string, unknown>;
    if (msg === "Preset fetch error" && typeof metaObj.preset === "string") {
      const err = metaObj.err;
      const errMsg = err instanceof Error ? err.message : String(err ?? "unknown error");
      this.emit({
        kind: "preset-error",
        title: `Failed to fetch preset "${metaObj.preset}": ${errMsg}`,
        source: { raw: metaObj.preset },
        level,
        meta: toSerializable(meta),
      });
      return;
    }
    const resolving = msg?.match(/^Resolving preset "(.+)"$/);
    if (resolving) {
      this.emit({
        kind: "preset-fetch",
        title: msg ?? "",
        source: { raw: resolving[1] },
        level,
      });
      return;
    }
    this.emit({
      kind: "log",
      title: msg ?? "",
      level,
      meta: meta === undefined ? undefined : toSerializable(meta),
    });
  }
}

let current: TraceCollector | null = null;

export function setCurrentCollector(collector: TraceCollector | null): void {
  current = collector;
}

/** Called by the logger shim; a no-op when no pipeline run is active. */
export function emitLog(level: LogLevel, meta: unknown, msg: string | undefined): void {
  current?.onLog(level, meta, msg);
}

/** Called by the migration shim; a no-op when no pipeline run is active. */
export function emitMigrationStep(step: MigrationStepEmit): void {
  current?.onMigrationStep(step);
}
