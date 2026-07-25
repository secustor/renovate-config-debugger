import type { StageId, TraceResult } from "@renovate-config-visualizer/engine";
import { Explained } from "../glossary";
import { STAGE_EXPLAINERS, STAGE_LABELS } from "../stage-copy";
import { describeStageActivity, getStageActivity } from "../stage-activity";

const STAGE_ORDER: StageId[] = [
  "global",
  "inherit",
  "parse",
  "migrate",
  "massage",
  "validate",
  "preset",
  "merge",
];

interface Props {
  result: TraceResult;
  selected: StageId;
  onSelect: (stage: StageId) => void;
}

export function StageTimeline({ result, selected, onSelect }: Props) {
  return (
    <div className="stage-timeline">
      {STAGE_ORDER.map((stage) => {
        const activity = getStageActivity(result, stage);
        return (
          <Explained key={stage} entry={STAGE_EXPLAINERS[stage]}>
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
        );
      })}
    </div>
  );
}
