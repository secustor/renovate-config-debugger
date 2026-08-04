import type { RuleAttribution, ValidationMessage } from "@renovate-config-debugger/engine";
import { ErrorTranslationView } from "@/components/ErrorTranslationView";
import { RuleMessage } from "@/components/RuleMessage";
import type { ErrorTranslationLib } from "@/platform/run";

/** The simulation's own validator output — errors then warnings, each with the
 *  014 translation below it. */
export function SimMessages({
  errors,
  warnings,
  ruleAttribution,
  onJumpToEditor,
  onJumpToSimRule,
  errorLib,
}: {
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  ruleAttribution: RuleAttribution[] | null | undefined;
  onJumpToEditor?: (repoIndex: number) => void;
  onJumpToSimRule?: (mergedIndex: number) => void;
  errorLib: ErrorTranslationLib | null;
}) {
  // Keyed by topic + text (roadmap 041) — same identity the messages panel
  // uses; the simulator re-runs on every edit, so a stale index would carry a
  // fixed message's DOM over to its replacement.
  return (
    <ul className="messages sim-messages">
      {errors.map((m) => (
        <li key={`e:${m.topic}:${m.message}`} className="error">
          <strong>{m.topic}</strong>:{" "}
          <RuleMessage
            message={m}
            indexKind="merged"
            ruleAttribution={ruleAttribution}
            onJumpToEditor={onJumpToEditor}
            onJumpToSimRule={onJumpToSimRule}
          />
          <ErrorTranslationView message={m} errorLib={errorLib} config={null} />
        </li>
      ))}
      {warnings.map((m) => (
        <li key={`w:${m.topic}:${m.message}`} className="warn">
          <strong>{m.topic}</strong>:{" "}
          <RuleMessage
            message={m}
            indexKind="merged"
            ruleAttribution={ruleAttribution}
            onJumpToEditor={onJumpToEditor}
            onJumpToSimRule={onJumpToSimRule}
          />
          <ErrorTranslationView message={m} errorLib={errorLib} config={null} />
        </li>
      ))}
    </ul>
  );
}
