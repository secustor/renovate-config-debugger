import type { TraceResult } from "@renovate-config-visualizer/engine";

export function MessagesPanel({ result }: { result: TraceResult }) {
  const presetErrors = result.events.filter((e) => e.kind === "preset-error");
  if (result.errors.length + result.warnings.length + presetErrors.length === 0) {
    return null;
  }
  return (
    <div className="card">
      <div className="card-title">Errors &amp; warnings</div>
      <ul className="messages">
        {result.errors.map((m, i) => (
          <li key={`e${i}`} className="error">
            <strong>{m.topic}:</strong> {m.message}
          </li>
        ))}
        {result.warnings.map((m, i) => (
          <li key={`w${i}`} className="warn">
            <strong>{m.topic}:</strong> {m.message}
          </li>
        ))}
        {presetErrors.map((e) => (
          <li key={e.id} className="error">
            {e.title}
          </li>
        ))}
      </ul>
    </div>
  );
}
