import type { StageId } from "@renovate-config-debugger/engine";
import type { StageActivity } from "./stage-activity";
import { nf, plural } from "./format";

/**
 * Roadmap 075 (v2, iteration 4): the one-glance number under a stage node on
 * the Pipeline rail — "what did this stage DO to the config", in the fewest
 * characters that stay honest — and the same fact as the sentence the stage
 * card's header carries. Two renderings of one derivation, so the rail and the
 * card can never disagree.
 *
 * Every input is a fact the run already derived: {@link StageActivity} (024's
 * level + count, computed by `stage-activity.ts`) plus the two run-level
 * counts the app already has on screen — the resolved preset count (the
 * Presets badge) and the effective config's key count (the header digest's
 * "N effective options"). Nothing here rescans the event stream.
 */

/** How the delta is toned. `dim` is a stage with nothing to report; `neutral`
 *  is a number that is a fact rather than a change (merge's key count). */
export type StageDeltaTone = "dim" | "neutral" | "ok" | "warn" | "error";

export interface StageDelta {
  /** The rendered line, e.g. `∅`, `Δ 2`, `3 warn`, `+1,102`, `= 62`. */
  text: string;
  tone: StageDeltaTone;
  /**
   * Appended to the node's accessible name when the delta says something the
   * activity sentence (`describeStageActivity`) does not already say. The
   * glyph shorthand itself is never spoken — the span is `aria-hidden`.
   */
  announce?: string;
}

export interface StageDeltaFacts {
  /** Unique resolved presets — `RunFacts.presetCount`. */
  presetCount: number;
  /** Keys in the effective config — `EffectiveTally.keys`. Null until the
   *  browser has finished computing provenance, and the merge node then shows
   *  no delta rather than a number it does not have. */
  effectiveKeys: number | null;
}

function num(value: number): string {
  return nf.format(value);
}

/**
 * The delta line for one stage, or null when the stage has nothing to show at
 * all (only merge, and only while the effective tally is still pending).
 *
 * Migrate deliberately reports `Δ N` rather than the design mock's `+1 −1`
 * churn: a `migration-applied` step is not necessarily an option swapped for
 * another one — Renovate also rewrites a value in place, drops an option, or
 * restructures one — and the trace records the rewrite, not an added/removed
 * pair. `Δ N` is the number the run actually knows.
 */
export function stageDelta(
  stage: StageId,
  activity: StageActivity,
  facts: StageDeltaFacts,
): StageDelta | null {
  if (activity.level === "skipped") {
    return { text: "∅", tone: "dim" };
  }
  if (activity.level === "error") {
    return activity.count === undefined
      ? { text: "failed", tone: "error" }
      : { text: `${num(activity.count)} err`, tone: "error" };
  }
  if (activity.level === "changed") {
    if (stage === "validate") {
      return activity.count === undefined
        ? { text: "warn", tone: "warn" }
        : { text: `${num(activity.count)} warn`, tone: "warn" };
    }
    return {
      text: activity.count === undefined ? "Δ" : `Δ ${num(activity.count)}`,
      tone: "warn",
    };
  }

  // Clean: the always-transform stages (024) are where a plain count says more
  // than "nothing changed" ever could.
  if (stage === "preset" && facts.presetCount > 0) {
    return {
      text: `+${num(facts.presetCount)}`,
      tone: "ok",
      announce: `${plural(facts.presetCount, "preset")} resolved`,
    };
  }
  if (stage === "merge") {
    return facts.effectiveKeys === null
      ? null
      : {
          text: `= ${num(facts.effectiveKeys)}`,
          tone: "neutral",
          announce: `${plural(facts.effectiveKeys, "option")} in the effective config`,
        };
  }
  return { text: "Δ 0", tone: "dim" };
}

/**
 * The same outcome as one lowercase clause, for the stage card's header strip
 * (`Stage: Migrate — 1 deprecated option rewritten`). It states what HAPPENED
 * this run; what the stage IS stays in `STAGE_EXPLAINERS`, one hover away on
 * the rail node itself.
 */
export function stageHint(stage: StageId, activity: StageActivity, facts: StageDeltaFacts): string {
  if (activity.level === "skipped") {
    return "skipped in this run";
  }
  if (activity.level === "error") {
    return activity.count === undefined
      ? "this stage failed"
      : `${plural(activity.count, "error")} reported`;
  }
  if (activity.level === "changed") {
    const count = activity.count ?? 0;
    if (stage === "migrate") {
      return `${plural(count, "deprecated option")} rewritten`;
    }
    if (stage === "validate") {
      return plural(count, "warning");
    }
    return `${plural(count, "change")} applied`;
  }
  if (stage === "migrate") {
    return "nothing to migrate";
  }
  if (stage === "massage") {
    return "left the config unchanged";
  }
  if (stage === "validate") {
    return "no warnings";
  }
  if (stage === "preset") {
    return facts.presetCount > 0
      ? `${plural(facts.presetCount, "preset")} resolved`
      : "no presets to resolve";
  }
  if (stage === "merge" && facts.effectiveKeys !== null) {
    return `${plural(facts.effectiveKeys, "option")} in the effective config`;
  }
  return "ran without incident";
}
