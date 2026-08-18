import type {
  ErrorFixResult,
  RuleAttribution,
  TraceResult,
} from "@renovate-config-debugger/engine";
import { memo, useMemo } from "react";
import type { ErrorTranslationLib } from "@/platform/run";
import { validatedConfigOf } from "@/lib/run-facts";
import { PresetProblemCard, ProblemCard } from "./ProblemCard";

const nf = new Intl.NumberFormat();

function plural(n: number, word: string): string {
  return `${nf.format(n)} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Roadmap 075 (iteration 5): the tab's summary strip — the whole Problems
 * story in one sentence, counts in ink. The numbers are App's own
 * `errorCount`/`warningCount` (see `lib/run-facts.ts`, where errors already
 * include preset-resolution failures) rather than a second count taken off the
 * cards below, so the strip can never disagree with the tab's badge.
 */
function ProblemsSummary({
  errorCount,
  warningCount,
}: {
  errorCount: number;
  warningCount: number;
}) {
  if (errorCount + warningCount === 0) {
    return <div className="summary-strip">No problems — this config is accepted.</div>;
  }
  if (errorCount === 0) {
    return (
      <div className="summary-strip">
        <span>
          <strong>{plural(warningCount, "warning")}</strong> — Renovate accepts this config;
          warnings still run.
        </span>
      </div>
    );
  }
  return (
    <div className="summary-strip">
      <span>
        <strong>{plural(errorCount, "error")}</strong> ·{" "}
        <strong>{plural(warningCount, "warning")}</strong> — a real run would crash on the errors;
        warnings still run.
      </span>
    </div>
  );
}

// Roadmap 032: memoized — a run with many findings renders a long message
// list, and none of it reads editor state, so typing must not re-render it.
export const MessagesPanel = memo(function MessagesPanel({
  result,
  errorCount,
  warningCount,
  ruleAttribution,
  onJumpToEditor,
  onJumpToSimRule,
  errorLib,
  onApplyFix,
}: {
  result: TraceResult;
  /** Roadmap 075: the tab's own counts, owned by App (`deriveRunFacts`) — the
   *  same pair the tab badge and the header digest quote. */
  errorCount: number;
  warningCount: number;
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
  const presetErrors = useMemo(
    () => result.events.filter((e) => e.kind === "preset-error"),
    [result.events],
  );
  // The exact config `validateConfig("repo", …)` ran against — see
  // `validatedConfigOf` (roadmap 058 hoisted it so `rcd validate` translates
  // messages against the same snapshot this panel does).
  const validatedConfig = useMemo(() => validatedConfigOf(result), [result]);
  if (result.errors.length + result.warnings.length + presetErrors.length === 0) {
    // The strip alone: a clean run still gets the tab's one-sentence verdict,
    // which is what the tab's bare "No errors or warnings" note used to be.
    return <ProblemsSummary errorCount={errorCount} warningCount={warningCount} />;
  }
  return (
    <>
      <ProblemsSummary errorCount={errorCount} warningCount={warningCount} />
      {/* Still a list, and still keyed by topic + text (roadmap 041):
          validator messages name the config path they concern, so the pair is
          the message's identity — and unlike the list index it survives a
          message being fixed above. 075 turns each item into a card; the list
          semantics stay, because they are what says how many findings there
          are. */}
      <ul className="messages problem-list">
        {result.errors.map((m) => (
          <ProblemCard
            key={`e:${m.topic}:${m.message}`}
            message={m}
            severity="error"
            errorLib={errorLib ?? null}
            config={validatedConfig}
            ruleAttribution={ruleAttribution}
            onJumpToEditor={onJumpToEditor}
            onJumpToSimRule={onJumpToSimRule}
            onApplyFix={onApplyFix}
          />
        ))}
        {result.warnings.map((m) => (
          <ProblemCard
            key={`w:${m.topic}:${m.message}`}
            message={m}
            severity="warning"
            errorLib={errorLib ?? null}
            config={validatedConfig}
            ruleAttribution={ruleAttribution}
            onJumpToEditor={onJumpToEditor}
            onJumpToSimRule={onJumpToSimRule}
            onApplyFix={onApplyFix}
          />
        ))}
        {presetErrors.map((e) => (
          <PresetProblemCard key={e.id} title={e.title} />
        ))}
      </ul>
    </>
  );
});
