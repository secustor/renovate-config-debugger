import type { RuleAttribution, TraceResult } from "@renovate-config-visualizer/engine";
import { RuleMessage } from "./RuleMessage";

export function MessagesPanel({
  result,
  ruleAttribution,
  onJumpToEditor,
  onJumpToSimRule,
}: {
  result: TraceResult;
  /** Roadmap 013: for cross-linking `packageRules[i]` references (repo-config
   *  index, since these messages come from validating the repo's own config
   *  before any preset merge) to the editor line and the simulator's rule row. */
  ruleAttribution?: RuleAttribution[] | null;
  onJumpToEditor?: (repoIndex: number) => void;
  onJumpToSimRule?: (mergedIndex: number) => void;
}) {
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
            <strong>{m.topic}:</strong>{" "}
            <RuleMessage
              message={m}
              indexKind="repo"
              ruleAttribution={ruleAttribution}
              onJumpToEditor={onJumpToEditor}
              onJumpToSimRule={onJumpToSimRule}
            />
          </li>
        ))}
        {result.warnings.map((m, i) => (
          <li key={`w${i}`} className="warn">
            <strong>{m.topic}:</strong>{" "}
            <RuleMessage
              message={m}
              indexKind="repo"
              ruleAttribution={ruleAttribution}
              onJumpToEditor={onJumpToEditor}
              onJumpToSimRule={onJumpToSimRule}
            />
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
