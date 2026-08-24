import { memo } from "react";
import type { StageId, TraceResult } from "@renovate-config-debugger/engine";
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
    // The 008 layer stages skip when their input is absent, not on failure —
    // and since 076 the input is the editor directly above this note, so it
    // points at that rather than at a disclosure three clicks away.
    if (stage === "global") {
      return (
        <div className="empty-note">
          No global config provided this run — paste one above and press Run to model a self-hosted
          run&rsquo;s admin layer.
        </div>
      );
    }
    if (stage === "inherit") {
      return (
        <div className="empty-note">
          No inherited config provided this run — paste one above (or let a repo load fetch it) and
          press Run.
        </div>
      );
    }
    return <div className="empty-note">Stage was skipped because an earlier stage failed.</div>;
  }
  if (failed) {
    return (
      <ul className="messages">
        {/* Keyed by topic + text (roadmap 041) — a stage's failure messages
            name what failed, which is their identity here. */}
        {(failed.messages ?? [{ topic: "Error", message: failed.title }]).map((m) => (
          <li key={`${m.topic}:${m.message}`} className="error">
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
        {completed?.title ?? "This stage changed nothing in this run."}
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
