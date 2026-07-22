import { toSerializable } from "./delta";
import type { LogLevel, StageId, TraceEvent } from "./model";

/**
 * Collects trace events for the currently running pipeline. The logger shim
 * forwards every Renovate log call here, which is what turns Renovate's own
 * logging into trace events without touching its code.
 */
export class TraceCollector {
  readonly events: TraceEvent[] = [];
  private counter = 0;
  private stage: StageId = "parse";

  enterStage(stage: StageId): void {
    this.stage = stage;
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

  /** Entry point for the logger shim. Upgrades known messages to typed events. */
  onLog(level: LogLevel, meta: unknown, msg: string | undefined): void {
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
