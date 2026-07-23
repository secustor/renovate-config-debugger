import type {
  ErrorFixResult,
  RuleAttribution,
  TraceResult,
} from "@renovate-config-visualizer/engine";
import { useMemo } from "react";
import type { ErrorTranslationLib } from "../run";
import { ErrorTranslationView } from "./ErrorTranslationView";
import { RuleMessage } from "./RuleMessage";

export function MessagesPanel({
  result,
  ruleAttribution,
  onJumpToEditor,
  onJumpToSimRule,
  errorLib,
  onApplyFix,
}: {
  result: TraceResult;
  /** Roadmap 013: for cross-linking `packageRules[i]` references (repo-config
   *  index, since these messages come from validating the repo's own config
   *  before any preset merge) to the editor line and the simulator's rule row. */
  ruleAttribution?: RuleAttribution[] | null;
  onJumpToEditor?: (repoIndex: number) => void;
  onJumpToSimRule?: (mergedIndex: number) => void;
  /** Roadmap 014: curated translations + suggested fixes, rendered alongside
   *  (never instead of) the original message above. `undefined`/no `onApplyFix`
   *  before the engine chunk has loaded. */
  errorLib?: ErrorTranslationLib | null;
  onApplyFix?: (fix: ErrorFixResult) => void;
}) {
  const presetErrors = result.events.filter((e) => e.kind === "preset-error");
  // The exact config `validateConfig("repo", …)` ran against (post-migrate/
  // massage, pre-preset-merge) — matches the `packageRules[N]` indices these
  // messages name, so a suggested fix's path resolves against the SAME
  // snapshot the message was produced from.
  const validatedConfig = useMemo(
    () =>
      (result.events.find((e) => e.stage === "massage" && e.kind === "stage-complete")?.after as
        | Record<string, unknown>
        | undefined) ?? null,
    [result],
  );
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
            <ErrorTranslationView
              message={m}
              errorLib={errorLib ?? null}
              config={validatedConfig}
              onApplyFix={onApplyFix}
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
            <ErrorTranslationView
              message={m}
              errorLib={errorLib ?? null}
              config={validatedConfig}
              onApplyFix={onApplyFix}
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
