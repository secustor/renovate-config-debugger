import { createTwoFilesPatch } from "diff";
import { useMemo, useState } from "react";
import { Diff, Hunk, parseDiff } from "react-diff-view";
import type { StageId, TraceResult } from "@renovate-config-visualizer/engine";
import "react-diff-view/style/index.css";

interface Props {
  result: TraceResult;
  stage: StageId;
}

function pretty(value: unknown): string {
  return `${JSON.stringify(value, null, 2) ?? ""}\n`;
}

export function StageDiff({ result, stage }: Props) {
  const [viewType, setViewType] = useState<"unified" | "split">("unified");

  const stageEvents = result.events.filter((e) => e.stage === stage);
  const completed = stageEvents.findLast((e) => e.kind === "stage-complete");
  const failed = stageEvents.findLast((e) => e.kind === "stage-error");

  const diffText = useMemo(() => {
    if (!completed || completed.before === undefined || completed.after === undefined) {
      return null;
    }
    if (!completed.delta?.length) {
      return null;
    }
    const patch = createTwoFilesPatch(
      `before-${stage}`,
      `after-${stage}`,
      pretty(completed.before),
      pretty(completed.after),
      undefined,
      undefined,
      { context: 3 },
    );
    // drop the "===" preamble line — gitdiff-parser only understands the
    // ---/+++/@@ unified format
    return patch.split("\n").slice(1).join("\n");
  }, [completed, stage]);

  const files = useMemo(() => {
    if (!diffText) {
      return [];
    }
    try {
      return parseDiff(diffText);
    } catch {
      return [];
    }
  }, [diffText]);

  if (result.stageStatus[stage] === "skipped") {
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
  if (!diffText) {
    return (
      <div className="empty-note">
        {completed?.title ?? "This stage made no changes to the config."}
      </div>
    );
  }

  return (
    <div>
      <div className="toolbar">
        <span>{completed?.title}</span>
        <button
          type="button"
          onClick={() => setViewType(viewType === "unified" ? "split" : "unified")}
        >
          {viewType === "unified" ? "Side-by-side" : "Unified"}
        </button>
      </div>
      <div className="diff-wrapper">
        {files.map((file) => (
          <Diff
            key={`${file.oldRevision}-${file.newRevision}`}
            viewType={viewType}
            diffType={file.type}
            hunks={file.hunks}
          >
            {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
          </Diff>
        ))}
      </div>
    </div>
  );
}
