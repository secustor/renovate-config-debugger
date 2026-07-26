import { Fragment, useMemo, useRef } from "react";
import type { SimulationResult } from "@renovate-config-visualizer/engine";
import { ConfigJson } from "@/components/ConfigJson";
import { SequenceChip, SequenceSep, SequenceTimeline } from "@/components/SequenceTimeline";
import { StepThrough } from "@/components/StepThrough";
import type { MergeStop } from "./merge-stops";

/**
 * Roadmap 046: the merge sequence on the app's shared sequence grammar (2B of
 * the approved mockup) — every stop visible at once as a `SequenceChip`, the
 * selected stop's detail below as the SAME 004/044 `StepThrough` interaction.
 * The chips and the stepper share one index, so Prev/Next and chip clicks are
 * two handles on the same walk.
 */
function SimMergeTimeline({
  stops,
  index,
  onIndexChange,
}: {
  stops: MergeStop[];
  index?: number;
  onIndexChange?: (index: number) => void;
}) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const steps = useMemo(() => stops.map((s) => s.step), [stops]);
  const selected = Math.min(Math.max(index ?? 0, 0), stops.length - 1);
  return (
    <div className="sim-merge-steps" ref={timelineRef}>
      <SequenceTimeline label="Merge sequence">
        {stops.map((stop, i) => (
          <Fragment key={stop.step.id}>
            {i > 0 ? <SequenceSep /> : null}
            <SequenceChip
              selected={i === selected}
              dot={stop.chip.dot}
              count={stop.chip.count}
              aria-label={stop.chip.ariaLabel}
              onClick={() => onIndexChange?.(i)}
            >
              {stop.chip.label}
            </SequenceChip>
          </Fragment>
        ))}
      </SequenceTimeline>
      <StepThrough
        steps={steps}
        index={index}
        onIndexChange={onIndexChange}
        cumulativeNames={["before any rule", "after this step"]}
        cumulativeLabel="Diff vs. base config"
      />
    </div>
  );
}

/**
 * Roadmap 046/047: the body of the "How the final config was built" drawer —
 * the merge timeline. The 046 micro-heading and its standalone summary
 * sentence are gone: the drawer's own title and computed summary row say the
 * same thing while collapsed. When nothing merged, the timeline has no
 * sequence to walk and the final config falls back to the plain disclosure.
 */
export function SimMergeBody({
  finalDependencyConfig,
  stops,
  showTimeline,
  mergeStepIndex,
  onMergeStepChange,
}: {
  finalDependencyConfig: SimulationResult["finalDependencyConfig"];
  stops: MergeStop[];
  showTimeline: boolean;
  mergeStepIndex?: number;
  onMergeStepChange?: (index: number) => void;
}) {
  return showTimeline ? (
    <SimMergeTimeline stops={stops} index={mergeStepIndex} onIndexChange={onMergeStepChange} />
  ) : (
    <details className="sim-final">
      <summary>Show the full resolved dependency config</summary>
      <pre className="config-view">
        <ConfigJson value={finalDependencyConfig} />
      </pre>
    </details>
  );
}
