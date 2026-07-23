import { useMemo, useState } from "react";
import type { TraceResult } from "@renovate-config-visualizer/engine";
import { ConfigJson } from "./ConfigJson";

/**
 * Shows the effective config. By default hides keys whose value is identical
 * to the untouched Renovate default, so users see what their config actually
 * changes; a toggle reveals the fully hydrated config.
 */
export function EffectiveConfig({ result }: { result: TraceResult }) {
  const [showDefaults, setShowDefaults] = useState(false);

  const display = useMemo(() => {
    if (!result.finalConfig) {
      return undefined;
    }
    if (showDefaults) {
      return result.finalConfig;
    }
    const merge = result.events.findLast((e) => e.stage === "merge" && e.kind === "stage-complete");
    const defaults = (merge?.before ?? {}) as Record<string, unknown>;
    const trimmed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result.finalConfig)) {
      if (JSON.stringify(defaults[key]) !== JSON.stringify(value)) {
        trimmed[key] = value;
      }
    }
    return trimmed;
  }, [result, showDefaults]);

  if (!display) {
    return null;
  }

  return (
    <div className="card">
      <div className="card-title">
        Effective config{" "}
        <label style={{ fontWeight: "normal" }}>
          <input
            type="checkbox"
            checked={showDefaults}
            onChange={(e) => setShowDefaults(e.target.checked)}
          />{" "}
          include untouched defaults
        </label>
      </div>
      <pre className="config-view">
        <ConfigJson value={display} />
      </pre>
    </div>
  );
}
