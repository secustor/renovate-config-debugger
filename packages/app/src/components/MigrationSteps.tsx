import { memo, useMemo } from "react";
import type { TraceEvent } from "@renovate-config-visualizer/engine";
import { CodeText } from "./CodeText";
import { CopyButton } from "./CopyButton";
import { StepThrough, type StepThroughStep } from "./StepThrough";

interface Props {
  /** Granular `migration-applied` events, in the order Renovate applied them. */
  steps: TraceEvent[];
  /**
   * Authoritative final config for the "Copy migrated config" button. Falls
   * back to the last step's `after` when omitted.
   */
  finalConfig?: unknown;
  /** Tighter layout for the preset detail panel. */
  compact?: boolean;
  /**
   * Controlled step index. When provided (with onIndexChange), the parent owns
   * the index — used so a shareable link (007) can restore the step. Falls back
   * to internal state when omitted (the uncontrolled PresetDetail instance).
   */
  index?: number;
  onIndexChange?: (index: number) => void;
}

/**
 * Roadmap 004: steps through the migrations Renovate applied one at a time.
 * Each step names the migration, explains why the old form is deprecated, and
 * shows its diff.
 *
 * Roadmap 044: the interaction itself (counter, Prev/Next/Jump to end, the
 * per-step diff and the Cumulative toggle) lives in `StepThrough`, shared with
 * the simulator's merge stepper; this component is the migrate-stage adapter —
 * it names the steps and owns the "Copy migrated config" action.
 */
export const MigrationSteps = memo(function MigrationSteps({
  steps,
  finalConfig,
  compact,
  index,
  onIndexChange,
}: Props) {
  const throughSteps = useMemo<StepThroughStep[]>(
    () =>
      steps.map((step, i) => {
        const migration = step.migration;
        return {
          // Index-keyed: Renovate re-runs migrations until stable, so the same
          // migration name/key can legitimately appear more than once.
          id: `${i}`,
          before: step.before,
          after: step.after,
          head: (
            <>
              <span className="migration-step-name">{migration?.name ?? step.title}</span>
              {migration?.key ? <code className="migration-step-key">{migration.key}</code> : null}
              {migration?.pass && migration.pass > 1 ? (
                <span className="badge count" title="Renovate re-runs migrations until stable">
                  pass {migration.pass}
                </span>
              ) : null}
            </>
          ),
          ...(migration?.explanation
            ? { explanation: <CodeText text={migration.explanation} /> }
            : {}),
        };
      }),
    [steps],
  );

  if (steps.length === 0) {
    return null;
  }
  const finalAfter = finalConfig ?? steps[steps.length - 1]?.after;

  return (
    <StepThrough
      steps={throughSteps}
      compact={compact}
      index={index}
      onIndexChange={onIndexChange}
      cumulativeNames={["stage start", "after this step"]}
      actions={
        /* The FINAL migrated config — deliberately not the same thing as the
           current step's "Copy result" in the diff chrome above (036). */
        <CopyButton
          getText={() => `${JSON.stringify(finalAfter, null, 2)}\n`}
          label="Copy migrated config"
          title="Copy the fully migrated config as JSON"
        />
      }
    />
  );
});
