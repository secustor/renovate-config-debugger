import { type ReactNode, useMemo, useState, useTransition } from "react";
import { Diff, getChangeKey, Hunk, parseDiff } from "react-diff-view";
import { jsonFile } from "@renovate-config-debugger/engine/json";
import { useDiffOptionHover } from "./option-docs-hooks";
import { buildJsonPatch } from "@/lib/json-patch";
import { CopyButton } from "./CopyButton";
import { SegmentedControl, type SegmentedOption } from "./SegmentedControl";
import "react-diff-view/style/index.css";

type FileData = ReturnType<typeof parseDiff>[number];
type HunkData = FileData["hunks"][number];

/**
 * `$schema` is a well-known editor-only key (roadmap 026): the presets stage
 * correctly drops it from the resolved config (it's not a Renovate option),
 * but an unannotated red "removed" row reads as a rejection. Attach an inline
 * note to that specific line instead of leaving it looking like an error.
 */
const SCHEMA_KEY_LINE_RE = /^\s*"\$schema"\s*:/;

/** The diff's two renderings. */
type DiffViewType = "unified" | "split";

const VIEW_OPTIONS: readonly SegmentedOption<DiffViewType>[] = [
  { value: "unified", label: "Unified" },
  { value: "split", label: "Side-by-side" },
];

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

/* Roadmap 046 also parameterized the note above (`BenignRemovals`) for the
   simulator's flatten step, whose per-stop diff 094 retired; the `$schema`
   case is the annotation's one caller again. */

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
  /** Optional text rendered at the head of the chrome row */
  title?: string;
}

/**
 * Renders the diff between two JSON values (chrome row with the `+N −N` stat,
 * a segmented unified/side-by-side control and "Copy result"; render budget
 * with a "show all" footer; option hover docs on `"key":` tokens).
 * Give it a `key` when reusing one instance for changing content so the
 * expansion state resets.
 */
export function JsonDiff({ before, after, names, title }: Props) {
  const [viewType, setViewType] = useState<DiffViewType>("unified");
  const [showAllRequested, setShowAllRequested] = useState(false);
  const [, startTransition] = useTransition();
  const hoverHandlers = useDiffOptionHover();

  // Roadmap 032: every call site writes `names` as an inline array literal, so
  // depending on the array would re-stringify + re-parse a multi-thousand-line
  // diff on EVERY parent render. Destructured to string primitives, the memo
  // only recomputes when a label actually changes.
  const [nameBefore = "before", nameAfter = "after"] = names ?? [];

  // Not jsdiff's `createTwoFilesPatch`: its Myers cost is proportional to the
  // old text × the edit distance, which cost ~1.6 s of blocked main thread on
  // the merge stage of a `config:recommended` run. `buildJsonPatch` produces
  // the same ---/+++/@@ text by anchoring on unchanged JSON blocks — the full
  // why, and the applyPatch contract it holds to, live in json-patch.ts.
  const diffText = useMemo(
    () => buildJsonPatch(nameBefore, nameAfter, before, after),
    [before, after, nameBefore, nameAfter],
  );

  const files = useMemo(() => {
    try {
      return parseDiff(diffText);
    } catch {
      return [];
    }
  }, [diffText]);

  // Roadmap 036: the `+N −N` stat counts the WHOLE diff, not the truncated
  // render — the number the chrome row reports is the size of the change, and
  // pressing "Show all" must not appear to change it. Memoized (032) so a
  // parent re-render doesn't rescan a multi-thousand-line diff; `total` (the
  // render budget's input) rides along in the same pass for the same reason.
  const stat = useMemo(() => {
    let insert = 0;
    let remove = 0;
    let total = 0;
    for (const file of files) {
      for (const hunk of file.hunks) {
        for (const change of hunk.changes) {
          total++;
          if (change.type === "insert") {
            insert++;
          } else if (change.type === "delete") {
            remove++;
          }
        }
      }
    }
    return { insert, remove, total };
  }, [files]);

  const showAll = showAllRequested || stat.total <= MAX_RENDERED_LINES;
  // Memoized (032) so the truncation pass — and the widgets scan below, which
  // depends on its identity — doesn't re-run on a render that changed neither
  // the diff nor the budget toggle.
  const visibleFiles = useMemo(
    () => (showAll ? files : truncateHunks(files, MAX_RENDERED_LINES)),
    [files, showAll],
  );
  // Computed before the early return below — hooks can't follow one.
  const widgets = useMemo(() => schemaRemovalWidgets(visibleFiles), [visibleFiles]);

  if (stat.total === 0) {
    return <div className="empty-note">No differences.</div>;
  }

  return (
    <div>
      {/* Roadmap 036: a chrome bar (surface + bottom border, the same grammar
          as a card title), not a floating toolbar. The view control is
          SEGMENTED because the old lone button said "Side-by-side" while
          unified was active — it labelled the action, not the state, which
          confused the 035 review. */}
      <div className="diff-chrome">
        {title ? <span className="diff-chrome-title">{title}</span> : null}
        <span className="diff-stat" aria-label={`${stat.insert} added, ${stat.remove} removed`}>
          <span className="plus">+{stat.insert}</span> <span className="minus">−{stat.remove}</span>
        </span>
        <span className="diff-chrome-spacer" />
        <SegmentedControl
          label="Diff view"
          value={viewType}
          options={VIEW_OPTIONS}
          onChange={(next) => startTransition(() => setViewType(next))}
        />
        <CopyButton
          getText={() => jsonFile(after)}
          label="Copy result"
          title="Copy this stage's resulting config as JSON"
        />
      </div>
      {/* The 035 dark-diff custom properties are scoped on `.diff-wrapper`
          (see index.css) — do not rename it or move the diff out of it. */}
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
      {/* Roadmap 036: the truncation used to hide in an `.empty-note` below the
          diff, where "Show all" read as prose. A footer bar makes it chrome. */}
      {!showAll && (
        <div className="diff-foot">
          Showing the first {MAX_RENDERED_LINES} of {stat.total} diff lines
          <button
            type="button"
            className="btn-secondary accent-text"
            onClick={() => startTransition(() => setShowAllRequested(true))}
          >
            Show all {stat.total} lines
          </button>
        </div>
      )}
    </div>
  );
}
