import type { ValidationMessage } from "@renovate-config-debugger/engine";
import { fixChangesValue, fixSnippet } from "@/lib/value-preview";
import type { ErrorTranslationLib } from "@/platform/run";

/**
 * Roadmap 014: renders ALONGSIDE Renovate's original validator message (never
 * instead of it — see `RuleSimulator.tsx`) whatever the curated translation
 * library (`errorLib`) has to say about it: a plain-language explanation, an
 * optional before/after snippet of a suggested edit, and a docs link. When
 * nothing matches, falls back to a bare docs link if the message names a known
 * option (003).
 *
 * `errorLib` is `null` until the engine chunk has loaded (same lazy-load
 * story as the option-docs hover cards) — nothing renders until then, same
 * as those cards degrade gracefully pre-load.
 *
 * Roadmap 075 (iteration 5): this is the SIMULATOR's rendering only. The
 * Problems tab, the one caller that ever passed a config snapshot and an
 * "Apply fix" handler, now renders the same library as fix-it cards
 * (`ProblemCard.tsx`) — so the apply button (and its bespoke ok-tinted style)
 * left this component with it; the standard `.btn-primary` is what applies a
 * fix now.
 */
export function ErrorTranslationView({
  message,
  errorLib,
  config,
}: {
  message: ValidationMessage;
  errorLib: ErrorTranslationLib | null;
  /** The exact config snapshot this message was validated against (root-relative
   *  fix paths); `null`/`undefined` when unavailable (skips fix computation) or
   *  when this context doesn't support applying fixes (e.g. the simulator echo). */
  config: Record<string, unknown> | null | undefined;
}) {
  if (!errorLib) {
    return null;
  }
  const translated = errorLib.translateMessage(message, config ?? null);
  if (!translated) {
    const doc = errorLib.findMentionedOption(message);
    if (!doc) {
      return null;
    }
    return (
      <div className="error-translation error-translation-fallback">
        <a href={doc.url} target="_blank" rel="noreferrer">
          {doc.name} docs ↗
        </a>
      </div>
    );
  }
  const { explanation, fix, docsUrl } = translated;
  const showDiff = fix && fixChangesValue(fix.before, fix.after);
  return (
    <div className="error-translation">
      <p className="error-translation-explain">{explanation}</p>
      {fix ? (
        <div className="error-translation-fix">
          {showDiff ? (
            <div className="error-translation-diff">
              <code className="before">{fixSnippet(fix.before)}</code>
              <span className="error-translation-arrow" aria-hidden="true">
                →
              </span>
              <code className="after">
                {fix.after === undefined ? "(removed)" : fixSnippet(fix.after)}
              </code>
            </div>
          ) : (
            <p className="error-translation-summary">{fix.summary}</p>
          )}
        </div>
      ) : null}
      {docsUrl ? (
        <a className="error-translation-docs" href={docsUrl} target="_blank" rel="noreferrer">
          docs.renovatebot.com ↗
        </a>
      ) : null}
    </div>
  );
}
