import { memo, useEffect, useState } from "react";
import type { TraceEvent } from "@renovate-config-visualizer/engine";
import { JsonDiff } from "./JsonDiff";

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
}

/**
 * Roadmap 004: steps through the migrations Renovate applied one at a time.
 * Each step names the migration, explains why the old form is deprecated, and
 * shows its diff. Steps carry full-document before/after snapshots, so both the
 * per-step diff (small) and the cumulative diff (stage start → current step)
 * come straight from the event stream.
 */
export const MigrationSteps = memo(function MigrationSteps({ steps, finalConfig, compact }: Props) {
  const [index, setIndex] = useState(0);
  const [cumulative, setCumulative] = useState(false);
  const [copied, setCopied] = useState(false);

  // A re-run replaces the event list; reset to the first step.
  useEffect(() => {
    setIndex(0);
    setCopied(false);
  }, [steps]);

  if (steps.length === 0) {
    return null;
  }

  const clamped = Math.min(index, steps.length - 1);
  const step = steps[clamped];
  if (!step) {
    return null;
  }
  const migration = step.migration;
  const stageStart = steps[0]?.before;
  const before = cumulative ? stageStart : step.before;
  const finalAfter = finalConfig ?? steps[steps.length - 1]?.after;

  function copy() {
    void navigator.clipboard.writeText(`${JSON.stringify(finalAfter, null, 2)}\n`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className={`migration-steps${compact ? " compact" : ""}`}>
      <div className="migration-step-head">
        <span className="migration-step-counter">
          Step {clamped + 1} of {steps.length}
        </span>
        <span className="migration-step-name">{migration?.name ?? step.title}</span>
        {migration?.key ? <code className="migration-step-key">{migration.key}</code> : null}
        {migration?.pass && migration.pass > 1 ? (
          <span className="badge count" title="Renovate re-runs migrations until stable">
            pass {migration.pass}
          </span>
        ) : null}
      </div>
      {migration?.explanation ? (
        <p className="migration-explanation">{migration.explanation}</p>
      ) : null}

      <JsonDiff
        key={`${clamped}-${cumulative ? "cumulative" : "single"}`}
        before={before}
        after={step.after}
        names={cumulative ? ["stage start", "after this step"] : ["before", "after"]}
      />

      <div className="migration-nav">
        <button type="button" onClick={() => setIndex(clamped - 1)} disabled={clamped === 0}>
          ‹ Prev
        </button>
        <button
          type="button"
          onClick={() => setIndex(clamped + 1)}
          disabled={clamped >= steps.length - 1}
        >
          Next ›
        </button>
        <button
          type="button"
          onClick={() => setIndex(steps.length - 1)}
          disabled={clamped >= steps.length - 1}
        >
          Jump to end
        </button>
        <label className="migration-cumulative">
          <input
            type="checkbox"
            checked={cumulative}
            onChange={(e) => setCumulative(e.target.checked)}
          />
          Cumulative
        </label>
        <button type="button" className="migration-copy" onClick={copy}>
          {copied ? "Copied!" : "Copy migrated config"}
        </button>
      </div>
    </div>
  );
});
