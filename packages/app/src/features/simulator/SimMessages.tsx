import type { RuleAttribution, ValidationMessage } from "@renovate-config-debugger/engine";
import { ErrorTranslationView } from "./ErrorTranslationView";
import { RuleMessage } from "@/components/RuleMessage";
import type { ErrorTranslationLib } from "@/platform/run";

/** The links and libraries every row renders with — one object threaded down
 *  from `SimMessages`, which takes the same contract from its caller. */
interface SimMessageLinks {
  ruleAttribution: RuleAttribution[] | null | undefined;
  onJumpToEditor?: (repoIndex: number) => void;
  onJumpToSimRule?: (mergedIndex: number) => void;
  errorLib: ErrorTranslationLib | null;
}

/** One validator message: the topic, the message with its `packageRules[i]`
 *  cross-links, and the 014 translation below it. The tone is the emitted
 *  class — `.messages li.error` / `li.warn` carry the rail color. */
function SimMessageRow({
  message,
  tone,
  ruleAttribution,
  onJumpToEditor,
  onJumpToSimRule,
  errorLib,
}: { message: ValidationMessage; tone: "error" | "warn" } & SimMessageLinks) {
  return (
    <li className={tone}>
      <strong>{message.topic}</strong>:{" "}
      <RuleMessage
        message={message}
        indexKind="merged"
        ruleAttribution={ruleAttribution}
        onJumpToEditor={onJumpToEditor}
        onJumpToSimRule={onJumpToSimRule}
      />
      <ErrorTranslationView message={message} errorLib={errorLib} config={null} />
    </li>
  );
}

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
} & SimMessageLinks) {
  // Keyed by topic + text (roadmap 041) — same identity the messages panel
  // uses; the simulator re-runs on every edit, so a stale index would carry a
  // fixed message's DOM over to its replacement.
  return (
    <ul className="messages sim-messages">
      {[
        ...errors.map((m) => ["error", m] as const),
        ...warnings.map((m) => ["warn", m] as const),
      ].map(([tone, m]) => (
        <SimMessageRow
          key={`${tone[0]}:${m.topic}:${m.message}`}
          message={m}
          tone={tone}
          ruleAttribution={ruleAttribution}
          onJumpToEditor={onJumpToEditor}
          onJumpToSimRule={onJumpToSimRule}
          errorLib={errorLib}
        />
      ))}
    </ul>
  );
}
