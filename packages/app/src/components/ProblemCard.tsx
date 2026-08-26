import type {
  ErrorFixResult,
  RuleAttribution,
  ValidationMessage,
} from "@renovate-config-debugger/engine";
import { fixChangesValue, fixSnippet } from "@/lib/value-preview";
import type { ErrorTranslationLib } from "@/platform/run";
import { RuleMessage } from "./RuleMessage";

/**
 * Roadmap 075 (iteration 5): one problem = one fix-it card. The Problems tab
 * used to be a single "Errors & warnings" card holding a `<ul>` of messages,
 * each of which grew a translation block underneath it (014's
 * `ErrorTranslationView`); a config with a handful of findings read as one
 * wall of red prose. The card puts the three things a reader acts on in fixed
 * places instead:
 *
 *   head  — severity pill · the option the message names · docs link, right
 *   body  — Renovate's own message, then the plain-language explanation, then
 *           the suggested edit as a unified −/+ strip and ONE primary button
 *
 * Nothing here is new information: the translation, the fix and the docs URL
 * all come from the same 014 library the old block used, read in the same
 * order the CLI's `describeMessage` reads them (`packages/cli/src/projections/
 * messages.ts`) so the two never disagree about which docs page a message gets.
 */

export type ProblemSeverity = "error" | "warning";

/** The severity's pill tone and its label — the design sheet's two message
 *  tones, which are also the two `.messages li` classes the e2e suites and the
 *  old rendering already keyed off. */
const SEVERITY: Record<ProblemSeverity, { tone: string; label: string; rowClass: string }> = {
  error: { tone: "pill-error", label: "error", rowClass: "error" },
  warning: { tone: "pill-warn", label: "warning", rowClass: "warn" },
};

/** The card's header strip: what kind of problem, which option it is about,
 *  and where the docs for it are. Its own component so the strip's three cells
 *  stay one level from the card (`react/jsx-max-depth`). */
function ProblemHead({
  severity,
  optionKey,
  docsUrl,
}: {
  severity: ProblemSeverity;
  /** The option the message names, when the 014 library recognises one. */
  optionKey?: string;
  docsUrl?: string;
}) {
  const { tone, label } = SEVERITY[severity];
  return (
    <div className="problem-head">
      <span className={`pill ${tone}`}>{label}</span>
      {optionKey ? <code className="problem-key">{optionKey}</code> : null}
      {docsUrl ? (
        <a className="problem-docs" href={docsUrl} target="_blank" rel="noreferrer">
          docs ↗
        </a>
      ) : null}
    </div>
  );
}

/** One line of the unified fix diff. */
function DiffLine({ sign, tone, text }: { sign: string; tone: string; text: string }) {
  return (
    <div className={`problem-diff-line ${tone}`}>
      <span className="problem-diff-sign" aria-hidden="true">
        {sign}
      </span>
      <code>{text}</code>
    </div>
  );
}

/**
 * The suggested edit, as the unified −/+ strip the rest of the app already
 * reads diffs in (the `--diff-removed-bg` / `--diff-added-bg` tints are the
 * ones `JsonDiff`'s rows wear). The old rendering put the two values on ONE
 * line separated by an arrow, which stopped being legible the moment either
 * side was an object.
 */
function FixDiff({ before, after }: { before: unknown; after: unknown }) {
  return (
    <div className="problem-diff">
      <DiffLine sign="−" tone="removed" text={fixSnippet(before)} />
      <DiffLine
        sign="+"
        tone="added"
        text={after === undefined ? "(removed)" : fixSnippet(after)}
      />
    </div>
  );
}

/**
 * The card's fix row: the edit, then the one primary button that applies it.
 * `onApplyFix` is absent wherever applying is not offered (no engine chunk
 * yet), in which case the edit is still shown — knowing WHAT to change is the
 * larger half of the answer.
 */
function ProblemFix({
  fix,
  onApplyFix,
}: {
  fix: ErrorFixResult;
  onApplyFix?: (fix: ErrorFixResult) => void;
}) {
  const showDiff = fixChangesValue(fix.before, fix.after);
  return (
    <div className="problem-fix">
      {showDiff ? (
        <FixDiff before={fix.before} after={fix.after} />
      ) : (
        <p className="problem-fix-summary">{fix.summary}</p>
      )}
      {onApplyFix ? (
        <button
          type="button"
          className="btn-primary"
          title={fix.summary}
          onClick={() => onApplyFix(fix)}
        >
          Apply fix to editor
        </button>
      ) : null}
    </div>
  );
}

/** Everything below the message: the explanation when 014 knows one, and
 *  either the fix or the honest note that there isn't one. */
function ProblemBody({
  explanation,
  fix,
  onApplyFix,
}: {
  explanation?: string;
  fix: ErrorFixResult | null;
  onApplyFix?: (fix: ErrorFixResult) => void;
}) {
  return (
    <div className="problem-body">
      {explanation ? <p className="problem-explain">{explanation}</p> : null}
      {fix ? (
        <ProblemFix fix={fix} onApplyFix={onApplyFix} />
      ) : (
        <p className="problem-nofix">No automatic fix — the message above says what to change.</p>
      )}
    </div>
  );
}

/**
 * One validator message as a card. Stays an `<li>` inside the panel's
 * `ul.messages` (roadmap 041's topic+text key is applied by the caller): the
 * list semantics are what tell a screen reader how many findings there are,
 * and the card is a restyle of the item, not a replacement for it.
 */
export function ProblemCard({
  message,
  severity,
  errorLib,
  config,
  ruleAttribution,
  onJumpToEditor,
  onJumpToSimRule,
  onApplyFix,
}: {
  message: ValidationMessage;
  severity: ProblemSeverity;
  /** `null` until the engine chunk has loaded — the card then renders the raw
   *  message alone, exactly as the old translation block degraded. */
  errorLib: ErrorTranslationLib | null;
  /** The exact snapshot this message was validated against (fix paths are
   *  root-relative to it); `null` skips fix computation. */
  config: Record<string, unknown> | null;
  ruleAttribution?: RuleAttribution[] | null;
  onJumpToEditor?: (repoIndex: number) => void;
  onJumpToSimRule?: (mergedIndex: number) => void;
  onApplyFix?: (fix: ErrorFixResult) => void;
}) {
  const translated = errorLib ? errorLib.translateMessage(message, config) : null;
  // Read for the header's option key on EVERY message, not just untranslated
  // ones: `translateMessage` resolves a docs URL but never hands back the
  // option's NAME, and the name is what the card's head is for. The docs URL
  // keeps 014's precedence (the translation's own, more specific page first).
  const mentioned = errorLib ? errorLib.findMentionedOption(message) : undefined;
  return (
    <li className={`problem-card ${SEVERITY[severity].rowClass}`}>
      <ProblemHead
        severity={severity}
        optionKey={mentioned?.name}
        docsUrl={translated?.docsUrl ?? mentioned?.url}
      />
      <p className="problem-message">
        <strong>{message.topic}:</strong>{" "}
        <RuleMessage
          message={message}
          indexKind="repo"
          ruleAttribution={ruleAttribution}
          onJumpToEditor={onJumpToEditor}
          onJumpToSimRule={onJumpToSimRule}
        />
      </p>
      <ProblemBody
        explanation={translated?.explanation}
        fix={translated?.fix ?? null}
        onApplyFix={onApplyFix}
      />
    </li>
  );
}

/**
 * A preset-resolution failure (roadmap 028 put these in this tab): the run
 * never got a message out of Renovate's validator, only a node that failed to
 * resolve, so there is no option to name, nothing to translate and nothing to
 * apply — the title IS the finding.
 */
export function PresetProblemCard({ title }: { title: string }) {
  return (
    <li className="problem-card error">
      <ProblemHead severity="error" />
      <p className="problem-message">{title}</p>
    </li>
  );
}
