import { createTwoFilesPatch } from "diff";
import { memo, useMemo, useState, useTransition } from "react";
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

type FileData = ReturnType<typeof parseDiff>[number];
type HunkData = FileData["hunks"][number];

/**
 * The preset and merge stages produce diffs of thousands of lines
 * (config:recommended alone resolves >1000 presets); rendering every row
 * blocks the main thread for seconds, so anything beyond this budget is
 * hidden behind an explicit "show all".
 */
const MAX_RENDERED_LINES = 600;

function truncateHunks(files: FileData[], budget: number): FileData[] {
  return files.map((file) => {
    const hunks: HunkData[] = [];
    for (const hunk of file.hunks) {
      if (budget <= 0) {
        break;
      }
      if (hunk.changes.length <= budget) {
        hunks.push(hunk);
        budget -= hunk.changes.length;
      } else {
        const changes = hunk.changes.slice(0, budget);
        hunks.push({
          ...hunk,
          changes,
          oldLines: changes.filter((c) => c.type !== "insert").length,
          newLines: changes.filter((c) => c.type !== "delete").length,
        });
        budget = 0;
      }
    }
    return { ...file, hunks };
  });
}

export const StageDiff = memo(function StageDiff({ result, stage }: Props) {
  const [viewType, setViewType] = useState<"unified" | "split">("unified");
  const [expandedStage, setExpandedStage] = useState<StageId | null>(null);
  const [, startTransition] = useTransition();

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

  const totalLines = files.reduce(
    (n, file) => n + file.hunks.reduce((m, hunk) => m + hunk.changes.length, 0),
    0,
  );
  const showAll = expandedStage === stage || totalLines <= MAX_RENDERED_LINES;
  const visibleFiles = useMemo(
    () => (showAll ? files : truncateHunks(files, MAX_RENDERED_LINES)),
    [files, showAll],
  );

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
          onClick={() =>
            startTransition(() => setViewType(viewType === "unified" ? "split" : "unified"))
          }
        >
          {viewType === "unified" ? "Side-by-side" : "Unified"}
        </button>
      </div>
      <div className="diff-wrapper">
        {visibleFiles.map((file) => (
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
      {!showAll && (
        <div className="empty-note">
          Showing the first {MAX_RENDERED_LINES} of {totalLines} diff lines.{" "}
          <button type="button" onClick={() => startTransition(() => setExpandedStage(stage))}>
            Show all
          </button>
        </div>
      )}
    </div>
  );
});
