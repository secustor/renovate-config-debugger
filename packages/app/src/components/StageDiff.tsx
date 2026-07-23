import { memo } from "react";
import type { StageId, TraceResult } from "@renovate-config-visualizer/engine";
import { JsonDiff } from "./JsonDiff";

interface Props {
  result: TraceResult;
  stage: StageId;
}

export const StageDiff = memo(function StageDiff({ result, stage }: Props) {
  const stageEvents = result.events.filter((e) => e.stage === stage);
  const completed = stageEvents.findLast((e) => e.kind === "stage-complete");
  const failed = stageEvents.findLast((e) => e.kind === "stage-error");

  if (result.stageStatus[stage] === "skipped") {
    // The 008 layer stages skip when their input is absent, not on failure.
    if (stage === "global") {
      return (
        <div className="empty-note">
          No global config provided — add one under &ldquo;Global config (self-hosted admin)&rdquo;
          to model a self-hosted run&rsquo;s admin layer.
        </div>
      );
    }
    if (stage === "inherit") {
      return (
        <div className="empty-note">
          No inherited config provided — add one under &ldquo;Inherited config
          (inheritConfig)&rdquo; to model the layer injected between global and repo config.
        </div>
      );
    }
    return <div className="empty-note">Stage was skipped because an earlier stage failed.</div>;
  }
  if (failed) {
    return (
      <ul className="messages">
        {(failed.messages ?? [{ topic: "Error", message: failed.title }]).map((m, i) => (
          <li key={i} className="error">
            <strong>{m.topic}:</strong> {m.message}
          </li>
        ))}
      </ul>
    );
  }
  if (
    !completed ||
    completed.before === undefined ||
    completed.after === undefined ||
    !completed.delta?.length
  ) {
    return (
      <div className="empty-note">
        {completed?.title ?? "This stage made no changes to the config."}
      </div>
    );
  }

  return (
    <JsonDiff
      key={stage}
      before={completed.before}
      after={completed.after}
      names={[`before-${stage}`, `after-${stage}`]}
      title={completed.title}
    />
  );
});
