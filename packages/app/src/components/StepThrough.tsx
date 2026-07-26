import { memo, type ReactNode, useEffect, useState } from "react";
import { type BenignRemovals, JsonDiff } from "./JsonDiff";

/** One step of a sequence: what it is, and the full config on both sides. */
export interface StepThroughStep {
  /** Stable identity for this step — used as the diff's remount key. */
  id: string;
  /** Cumulative document before this step ran. */
  before: unknown;
  /** Cumulative document after this step ran. */
  after: unknown;
  /** The head row: what this step is (name, key chip, badges). */
  head: ReactNode;
  /** Optional muted prose under the head. */
  explanation?: ReactNode;
  /**
   * Roadmap 046: counter text for sequences whose stops aren't uniform steps
   * (the merge timeline's "Start" / "Step 1 of 2" / "Result"). Defaults to
   * `Step N of M` over the whole list.
   */
  counter?: ReactNode;
  /** Roadmap 046: replaces the diff for stops that aren't merges (the base and
   *  final-config stops). The cumulative toggle doesn't apply to such a stop. */
  body?: ReactNode;
  /** Removals this step's diff should annotate as benign (see JsonDiff). */
  benignRemovals?: BenignRemovals;
}

interface Props {
  steps: StepThroughStep[];
  /** Tighter layout (the compact stepper embedded in a preset row). */
  compact?: boolean;
  /**
   * Controlled step index. When provided (with onIndexChange), the parent owns
   * the index — used so a shareable link (007/044) can restore the step. Falls
   * back to internal state when omitted (the uncontrolled PresetDetail instance).
   */
  index?: number;
  onIndexChange?: (index: number) => void;
  /** Diff labels while Cumulative is on. Per-step is always before/after. */
  cumulativeNames?: [string, string];
  /** The cumulative toggle's label (roadmap 046: the merge timeline names what
   *  the toggle does — "Diff vs. base config"). */
  cumulativeLabel?: ReactNode;
  /** Terminal action(s) at the end of the nav row (e.g. a Copy button). */
  actions?: ReactNode;
}

/**
 * Roadmap 044: the step-through interaction itself — Step N of M, Prev/Next/Jump
 * to end, a per-step `JsonDiff` and a Cumulative toggle that diffs from the
 * sequence's start instead. Extracted verbatim from roadmap 004's
 * `MigrationSteps` (which is now a thin adapter over it) so the simulator's
 * merge stepper is the SAME interaction and the same `.migration-steps` CSS
 * grammar, not a second dialect of it.
 *
 * Steps carry full-document before/after snapshots, which is what makes both
 * the per-step diff (small) and the cumulative one (sequence start → current
 * step) derivable without re-running anything.
 */
export const StepThrough = memo(function StepThrough({
  steps,
  compact,
  index,
  onIndexChange,
  cumulativeNames,
  cumulativeLabel,
  actions,
}: Props) {
  const controlled = index !== undefined;
  const [internalIndex, setInternalIndex] = useState(0);
  const [cumulative, setCumulative] = useState(false);
  const activeIndex = controlled ? index : internalIndex;
  const setIndex = (next: number) => {
    if (controlled) {
      onIndexChange?.(next);
    } else {
      setInternalIndex(next);
    }
  };

  // A re-run replaces the step list; reset to the first step. When controlled,
  // the parent owns the reset (it clears its index on new results).
  useEffect(() => {
    setInternalIndex(0);
  }, [steps]);

  if (steps.length === 0) {
    return null;
  }

  const clamped = Math.min(Math.max(activeIndex, 0), steps.length - 1);
  const step = steps[clamped];
  if (!step) {
    return null;
  }
  const sequenceStart = steps[0]?.before;
  const before = cumulative ? sequenceStart : step.before;

  return (
    <div className={`migration-steps${compact ? " compact" : ""}`}>
      <div className="migration-step-head">
        <span className="migration-step-counter">
          {step.counter ?? (
            <>
              Step {clamped + 1} of {steps.length}
            </>
          )}
        </span>
        {step.head}
      </div>
      {step.explanation ? <p className="migration-explanation">{step.explanation}</p> : null}

      {step.body ?? (
        <JsonDiff
          key={`${step.id}-${cumulative ? "cumulative" : "single"}`}
          before={before}
          after={step.after}
          names={
            cumulative ? (cumulativeNames ?? ["start", "after this step"]) : ["before", "after"]
          }
          benignRemovals={step.benignRemovals}
        />
      )}

      <div className="migration-nav">
        <button
          type="button"
          className="btn"
          onClick={() => setIndex(clamped - 1)}
          disabled={clamped === 0}
        >
          ‹ Prev
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setIndex(clamped + 1)}
          disabled={clamped >= steps.length - 1}
        >
          Next ›
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setIndex(steps.length - 1)}
          disabled={clamped >= steps.length - 1}
        >
          Jump to end
        </button>
        <label className="migration-cumulative">
          <input
            type="checkbox"
            checked={cumulative}
            onChange={(e) => setCumulative(e.target.checked)}
          />
          {cumulativeLabel ?? "Cumulative"}
        </label>
        {actions}
      </div>
    </div>
  );
});
