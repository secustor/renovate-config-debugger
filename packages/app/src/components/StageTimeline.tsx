import type { StageId, TraceResult } from "@renovate-config-visualizer/engine";

const STAGE_ORDER: StageId[] = ["parse", "migrate", "massage", "validate", "preset", "merge"];

const STAGE_LABELS: Record<StageId, string> = {
  parse: "Parse",
  migrate: "Migrate",
  massage: "Massage",
  validate: "Validate",
  preset: "Presets",
  merge: "Merge defaults",
};

interface Props {
  result: TraceResult;
  selected: StageId;
  onSelect: (stage: StageId) => void;
}

export function StageTimeline({ result, selected, onSelect }: Props) {
  return (
    <div className="stage-timeline">
      {STAGE_ORDER.map((stage) => (
        <button
          key={stage}
          type="button"
          className={`stage-chip${stage === selected ? " selected" : ""}`}
          onClick={() => onSelect(stage)}
        >
          <span className={`dot ${result.stageStatus[stage]}`} />
          {STAGE_LABELS[stage]}
        </button>
      ))}
    </div>
  );
}
