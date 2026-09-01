import { memo, type ReactNode, useState } from "react";
import { JsonDiff } from "./JsonDiff";
import { useSyncedReset } from "@/hooks/use-synced-reset";

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
}

interface Props {
  steps: StepThroughStep[];
  /** Tighter layout (the compact stepper embedded in a preset row). */
  compact?: boolean;
  /**
   * Controlled step index. When provided (with onIndexChange), the parent owns
   * the index — used so a shareable link (007) can restore the step. Falls
   * back to internal state when omitted (the uncontrolled PresetDetail instance).
   */
  index?: number;
  onIndexChange?: (index: number) => void;
  /** Diff labels while Cumulative is on. Per-step is always before/after. */
  cumulativeNames?: [string, string];
  /** Terminal action(s) at the end of the nav row (e.g. a Copy button). */
  actions?: ReactNode;
}

/**
 * Roadmap 044: the step-through interaction itself — Step N of M, Prev/Next/Jump
 * to end, a per-step `JsonDiff` and a Cumulative toggle that diffs from the
 * sequence's start instead. Extracted from roadmap 004's `MigrationSteps`
 * (which is now a thin adapter over it) for the simulator's merge stepper —
 * retired by 094, which also took with it the four fields 046 had added here
 * for it (`counter`, `body`, `cumulativeLabel`, `benignRemovals`). The migrate
 * stage is the one caller left.
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
  //
  // React's "adjust state when a prop changes" idiom rather than an effect on
  // `[steps]`: the list is the TRIGGER and nothing else — the reset does not
  // read it — so as an effect the list was a dependency the body never touched.
  // Done during render the trigger is the comparison itself, and the reset also
  // lands before the paint instead of one committed frame after it, where the
  // old index was briefly shown against the new list.
  useSyncedReset(steps, () => {
    setInternalIndex(0);
  });

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
          Step {clamped + 1} of {steps.length}
        </span>
        {step.head}
      </div>
      {step.explanation ? <p className="migration-explanation">{step.explanation}</p> : null}

      <JsonDiff
        key={`${step.id}-${cumulative ? "cumulative" : "single"}`}
        before={before}
        after={step.after}
        names={cumulative ? (cumulativeNames ?? ["start", "after this step"]) : ["before", "after"]}
      />

      <div className="migration-nav">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setIndex(clamped - 1)}
          disabled={clamped === 0}
        >
          ‹ Prev
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setIndex(clamped + 1)}
          disabled={clamped >= steps.length - 1}
        >
          Next ›
        </button>
        <button
          type="button"
          className="btn-secondary"
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
          Cumulative
        </label>
        {actions}
      </div>
    </div>
  );
});
