import { Fragment } from "react";
import type { StageId, TraceResult } from "@renovate-config-visualizer/engine";
import { Explained } from "./glossary";
import { STAGE_IDS } from "@/lib/input-schemas";
import { STAGE_EXPLAINERS, STAGE_LABELS } from "@/data/stage-copy";
import { describeStageActivity, getStageActivity } from "@/lib/stage-activity";

// Roadmap 033: the app's single stage list (satisfies-checked against the
// engine's exported STAGE_IDS), already in execution order.
const STAGE_ORDER: readonly StageId[] = STAGE_IDS;

interface Props {
  result: TraceResult;
  selected: StageId;
  onSelect: (stage: StageId) => void;
}

export function StageTimeline({ result, selected, onSelect }: Props) {
  return (
    <div className="stage-timeline">
      {STAGE_ORDER.map((stage, i) => {
        const activity = getStageActivity(result, stage);
        return (
          <Fragment key={stage}>
            {/* Roadmap 042: the order signal. A separator between consecutive
                chips is its own flex item, so a wrapped line leads with an
                arrow — decoration, hidden from the accessibility tree. */}
            {i > 0 ? (
              <span className="stage-sep" aria-hidden="true">
                →
              </span>
            ) : null}
            <Explained entry={STAGE_EXPLAINERS[stage]}>
              {(handlers) => (
                <button
                  type="button"
                  data-stage={stage}
                  className={`stage-chip${stage === selected ? " selected" : ""}`}
                  aria-label={describeStageActivity(stage, STAGE_LABELS[stage], activity)}
                  onClick={() => onSelect(stage)}
                  {...handlers}
                >
                  <span className={`dot ${activity.level}`} />
                  {STAGE_LABELS[stage]}
                  {activity.count !== undefined ? (
                    <span className="stage-chip-count">·{activity.count}</span>
                  ) : null}
                </button>
              )}
            </Explained>
          </Fragment>
        );
      })}
    </div>
  );
}
