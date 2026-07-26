import { Fragment } from "react";
import type { StageId, TraceResult } from "@renovate-config-visualizer/engine";
import { Explained } from "./glossary";
import { STAGE_IDS } from "@/lib/input-schemas";
import { STAGE_EXPLAINERS, STAGE_LABELS } from "@/data/stage-copy";
import { describeStageActivity, getStageActivity } from "@/lib/stage-activity";
import { SequenceChip, SequenceSep, SequenceTimeline } from "./SequenceTimeline";

// Roadmap 033: the app's single stage list (satisfies-checked against the
// engine's exported STAGE_IDS), already in execution order.
const STAGE_ORDER: readonly StageId[] = STAGE_IDS;

interface Props {
  result: TraceResult;
  selected: StageId;
  onSelect: (stage: StageId) => void;
}

/** Roadmap 046: a thin adapter over the shared `SequenceTimeline` grammar —
 *  the DOM (`.stage-chip` + dot + `·N` count) is unchanged from 024/042. */
export function StageTimeline({ result, selected, onSelect }: Props) {
  return (
    <SequenceTimeline label="Pipeline stages">
      {STAGE_ORDER.map((stage, i) => {
        const activity = getStageActivity(result, stage);
        return (
          <Fragment key={stage}>
            {i > 0 ? <SequenceSep /> : null}
            <Explained entry={STAGE_EXPLAINERS[stage]}>
              {(handlers) => (
                <SequenceChip
                  data-stage={stage}
                  selected={stage === selected}
                  dot={activity.level}
                  count={activity.count !== undefined ? `·${activity.count}` : undefined}
                  aria-label={describeStageActivity(stage, STAGE_LABELS[stage], activity)}
                  onClick={() => onSelect(stage)}
                  {...handlers}
                >
                  {STAGE_LABELS[stage]}
                </SequenceChip>
              )}
            </Explained>
          </Fragment>
        );
      })}
    </SequenceTimeline>
  );
}
