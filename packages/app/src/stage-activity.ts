import type { StageId, TraceEvent, TraceResult } from "@renovate-config-visualizer/engine";

/**
 * Roadmap 024: what a stage chip's dot should say happened this run, on top
 * of the raw ok/error/skipped `stageStatus`. Green universally read as
 * "nothing to see here" — the one stage that actually rewrote your config
 * (e.g. Migrate turning `semanticCommits: true` into `"enabled"`) looked
 * identical to a stage that passed it through untouched.
 *
 * The per-stage rule (documented again in each stage's STAGE_EXPLAINERS
 * card in StageTimeline.tsx):
 *  - migrate/massage/validate can meaningfully do nothing, so "clean" (green)
 *    vs "changed" (amber) is worth showing: migrate steps > 0, massage
 *    actually changed the config, validate has warnings.
 *  - parse/global/inherit/preset/merge always "transform" by nature —
 *    parsing text, assembling a config layer, resolving extends, merging
 *    defaults — so amber there would be permanently lit and meaningless.
 *    They stay "clean" whenever they succeed and only turn red on error.
 */
export type StageActivityLevel = "clean" | "changed" | "error" | "skipped";

export interface StageActivity {
  level: StageActivityLevel;
  /** Shown beside the chip label, e.g. "Migrate ·2" — omitted when not meaningful. */
  count?: number;
}

function stageEvents(result: TraceResult, stage: StageId): TraceEvent[] {
  return result.events.filter((e) => e.stage === stage);
}

export function getStageActivity(result: TraceResult, stage: StageId): StageActivity {
  const status = result.stageStatus[stage];
  if (status === "skipped") {
    return { level: "skipped" };
  }

  // Validate is the one stage where errors and a count coexist: an errored
  // run still reports how many errors, not just red.
  if (stage === "validate") {
    const events = stageEvents(result, "validate");
    if (status === "error") {
      const errorCount = events.filter(
        (e) => e.kind === "validation-message" && e.level === "error",
      ).length;
      return errorCount > 0 ? { level: "error", count: errorCount } : { level: "error" };
    }
    const warnCount = events.filter(
      (e) => e.kind === "validation-message" && e.level === "warn",
    ).length;
    return warnCount > 0 ? { level: "changed", count: warnCount } : { level: "clean" };
  }

  if (status === "error") {
    return { level: "error" };
  }

  if (stage === "migrate") {
    const count = stageEvents(result, "migrate").filter(
      (e) => e.kind === "migration-applied",
    ).length;
    return count > 0 ? { level: "changed", count } : { level: "clean" };
  }

  if (stage === "massage") {
    const completed = stageEvents(result, "massage").findLast((e) => e.kind === "stage-complete");
    const count = completed?.delta?.length ?? 0;
    return count > 0 ? { level: "changed", count } : { level: "clean" };
  }

  // parse/global/inherit/preset/merge: always-transform stages (see the
  // module doc above) — clean whenever they succeed, never amber.
  return { level: "clean" };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Short, human sentence for the chip's accessible name — screen readers get
 *  the outcome even though it's shown visually as a dot shape + color + count. */
export function describeStageActivity(
  stage: StageId,
  label: string,
  activity: StageActivity,
): string {
  if (activity.level === "skipped") {
    return `${label}: skipped`;
  }
  if (activity.level === "error") {
    return activity.count ? `${label}: ${plural(activity.count, "error")}` : `${label}: failed`;
  }
  if (activity.level === "changed" && activity.count !== undefined) {
    if (stage === "migrate") {
      return `${label}: ${plural(activity.count, "migration")} applied`;
    }
    if (stage === "validate") {
      return `${label}: ${plural(activity.count, "warning")}`;
    }
    return `${label}: ${plural(activity.count, "change")}`;
  }
  if (stage === "migrate") {
    return `${label}: nothing to migrate`;
  }
  if (stage === "massage") {
    return `${label}: unchanged`;
  }
  if (stage === "validate") {
    return `${label}: no warnings`;
  }
  return `${label}: ok`;
}
