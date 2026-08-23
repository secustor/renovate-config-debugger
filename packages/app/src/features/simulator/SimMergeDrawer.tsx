import { Fragment, memo, type RefObject } from "react";
import type { SimulationResult } from "@renovate-config-debugger/engine";
import { SummaryDrawer } from "./SummaryDrawer";
import type { MergeStop } from "./merge-stops";
import { SimMergeBody } from "./SimMergeBody";
import { pluralWord } from "@/lib/format";

/** Roadmap 047: the merge drawer's computed abstract — the whole timeline
 *  compressed to `base → N merges → flatten ⊘7 → final · changed groupName`,
 *  so the collapsed row still says what the merge history did. */
function MergeSummary({
  mergeCount,
  flattenCount,
  changedKeys,
}: {
  mergeCount: number;
  /** The flatten chip's own count (`+1` / `⊘7`); absent when nothing flattened. */
  flattenCount?: string;
  changedKeys: string[];
}) {
  const shown = changedKeys.slice(0, 3);
  const rest = changedKeys.length - shown.length;
  return (
    <>
      base → <span className="stat">{mergeCount}</span> {pluralWord(mergeCount, "merge")}
      {flattenCount === undefined ? null : (
        <>
          {" → flatten "}
          <span className="stat">{flattenCount}</span>
        </>
      )}
      {" → final · "}
      {shown.length === 0 ? (
        "nothing changed"
      ) : (
        <>
          changed{" "}
          {shown.map((key, i) => (
            <Fragment key={key}>
              {i > 0 ? ", " : null}
              <code>{key}</code>
            </Fragment>
          ))}
          {rest > 0 ? ` +${rest} more` : null}
        </>
      )}
    </>
  );
}

/**
 * Roadmap 047: the "How the final config was built" evidence layer.
 *
 * Roadmap 032: memoized — its subtree is the merge stepper and a multi-thousand
 * line `JsonDiff`, and every prop comes from the last RUN, not the live form,
 * so typing in the simulator form must not re-render it.
 */
export const SimMergeDrawer = memo(function SimMergeDrawer({
  finalDependencyConfig,
  stops,
  showTimeline,
  changedKeys,
  mergeStepIndex,
  onMergeStepChange,
  open,
  onToggle,
  detailsRef,
}: {
  finalDependencyConfig: SimulationResult["finalDependencyConfig"];
  stops: MergeStop[];
  showTimeline: boolean;
  changedKeys: string[];
  mergeStepIndex: number;
  onMergeStepChange: (index: number) => void;
  open: boolean;
  onToggle: (open: boolean) => void;
  detailsRef?: RefObject<HTMLDetailsElement | null>;
}) {
  return (
    <SummaryDrawer
      className="sim-drawer"
      detailsRef={detailsRef}
      title="How the final config was built"
      summary={
        <MergeSummary
          mergeCount={stops.filter((s) => s.kind === "rule").length}
          flattenCount={stops.find((s) => s.kind === "flatten")?.chip.count}
          changedKeys={changedKeys}
        />
      }
      open={open}
      onToggle={onToggle}
    >
      <SimMergeBody
        finalDependencyConfig={finalDependencyConfig}
        stops={stops}
        showTimeline={showTimeline}
        mergeStepIndex={mergeStepIndex}
        onMergeStepChange={onMergeStepChange}
      />
    </SummaryDrawer>
  );
});
