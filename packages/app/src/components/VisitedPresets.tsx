import type { TraceResult } from "@renovate-config-visualizer/engine";

export function VisitedPresets({ result }: { result: TraceResult }) {
  if (result.visitedPresets.merged.length === 0) {
    return null;
  }
  return (
    <div className="card">
      <div className="card-title">Resolved presets ({result.visitedPresets.merged.length})</div>
      <div className="preset-list">{result.visitedPresets.merged.join(" · ")}</div>
    </div>
  );
}
