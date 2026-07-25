import { createTwoFilesPatch } from "diff";
import { type ReactNode, useMemo, useState, useTransition } from "react";
import { Diff, getChangeKey, Hunk, parseDiff } from "react-diff-view";
import { useDiffOptionHover } from "../option-docs-hooks";
import "react-diff-view/style/index.css";

function pretty(value: unknown): string {
  return `${JSON.stringify(value, null, 2) ?? ""}\n`;
}

type FileData = ReturnType<typeof parseDiff>[number];
type HunkData = FileData["hunks"][number];

/**
 * `$schema` is a well-known editor-only key (roadmap 026): the presets stage
 * correctly drops it from the resolved config (it's not a Renovate option),
 * but an unannotated red "removed" row reads as a rejection. Attach an inline
 * note to that specific line instead of leaving it looking like an error.
 */
const SCHEMA_KEY_LINE_RE = /^\s*"\$schema"\s*:/;

function schemaRemovalWidgets(files: FileData[]): Record<string, ReactNode> {
  const widgets: Record<string, ReactNode> = {};
  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const change of hunk.changes) {
        if (change.type === "delete" && SCHEMA_KEY_LINE_RE.test(change.content)) {
          widgets[getChangeKey(change)] = (
            <span className="diff-benign-note">
              editor-only key, dropped from the resolved config — not an error
            </span>
          );
        }
      }
    }
  }
  return widgets;
}

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

interface Props {
  before: unknown;
  after: unknown;
  /** Optional file labels shown by react-diff-view */
  names?: [string, string];
  /** Optional text rendered next to the view-type toggle */
  title?: string;
}

/**
 * Renders the diff between two JSON values (unified/side-by-side toggle,
 * render budget with "show all", option hover docs on `"key":` tokens).
 * Give it a `key` when reusing one instance for changing content so the
 * expansion state resets.
 */
export function JsonDiff({ before, after, names, title }: Props) {
  const [viewType, setViewType] = useState<"unified" | "split">("unified");
  const [showAllRequested, setShowAllRequested] = useState(false);
  const [, startTransition] = useTransition();
  const hoverHandlers = useDiffOptionHover();

  const diffText = useMemo(() => {
    const patch = createTwoFilesPatch(
      names?.[0] ?? "before",
      names?.[1] ?? "after",
      pretty(before),
      pretty(after),
      undefined,
      undefined,
      { context: 3 },
    );
    // drop the "===" preamble line — gitdiff-parser only understands the
    // ---/+++/@@ unified format
    return patch.split("\n").slice(1).join("\n");
  }, [before, after, names]);

  const files = useMemo(() => {
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

  const showAll = showAllRequested || totalLines <= MAX_RENDERED_LINES;
  const visibleFiles = showAll ? files : truncateHunks(files, MAX_RENDERED_LINES);
  // Computed before the early return below — hooks can't follow one.
  const widgets = useMemo(() => schemaRemovalWidgets(visibleFiles), [visibleFiles]);

  if (totalLines === 0) {
    return <div className="empty-note">No differences.</div>;
  }

  return (
    <div>
      <div className="toolbar">
        {title ? <span>{title}</span> : null}
        <button
          type="button"
          onClick={() =>
            startTransition(() => setViewType(viewType === "unified" ? "split" : "unified"))
          }
        >
          {viewType === "unified" ? "Side-by-side" : "Unified"}
        </button>
      </div>
      <div className="diff-wrapper" {...hoverHandlers}>
        {visibleFiles.map((file) => (
          <Diff
            key={`${file.oldRevision}-${file.newRevision}`}
            viewType={viewType}
            diffType={file.type}
            hunks={file.hunks}
            widgets={widgets}
          >
            {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
          </Diff>
        ))}
      </div>
      {!showAll && (
        <div className="empty-note">
          Showing the first {MAX_RENDERED_LINES} of {totalLines} diff lines.{" "}
          <button type="button" onClick={() => startTransition(() => setShowAllRequested(true))}>
            Show all
          </button>
        </div>
      )}
    </div>
  );
}
