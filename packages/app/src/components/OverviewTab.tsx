import { Fragment, memo, type ReactNode } from "react";
import type { ResultsTabId } from "../results-tabs";
import type { DigestClause } from "../run-digest";

/**
 * Roadmap 029: clause prose marks option/preset names with backticks (the
 * generator stays plain text, so it can be unit-tested and snapshotted); the
 * renderer turns those into `<code>` spans, matching the mockup's mono names.
 */
function CodeText({ text }: { text: string }) {
  // Roadmap 041 — index keys, deliberately: this array is ONE string split on
  // backticks, so slot i is always the same span of the same string and the
  // odd/even parity is what decides `<code>` vs plain text. Parts repeat, and
  // insertion/reorder cannot happen; there is no other identity to key on.
  const parts = text.split(/`([^`]+)`/);
  return (
    <>
      {parts.map((part, i) =>
        // oxlint-disable-next-line react/no-array-index-key -- see above
        i % 2 === 1 ? <code key={i}>{part}</code> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}

/**
 * Roadmap 029: the run digest — the whole run as one paragraph of prose whose
 * numbers link into the tab that explains them. The clause model (run-digest.ts)
 * decides what it says; this only renders it.
 */
export function RunDigest({
  clauses,
  onOpen,
}: {
  clauses: DigestClause[];
  onOpen: (tab: ResultsTabId) => void;
}) {
  return (
    <p className="run-digest">
      {clauses.map((clause) => {
        const link = clause.link;
        return (
          <span
            key={clause.id}
            className={`digest-clause${clause.tone === "plain" ? "" : ` ${clause.tone}`}`}
            data-clause={clause.id}
          >
            {clause.text ? (
              <>
                <CodeText text={clause.text} />
                {link ? " " : null}
              </>
            ) : null}
            {link ? (
              <button type="button" className="digest-link" onClick={() => onOpen(link.tab)}>
                <CodeText text={link.label} />
              </button>
            ) : null}
            {clause.tail ? <CodeText text={clause.tail} /> : null}{" "}
          </span>
        );
      })}
    </p>
  );
}

/** The three question pills that route to the instrument answering them. */
function QuestionPills({
  onWhereFrom,
  onDependency,
  onStages,
}: {
  onWhereFrom: () => void;
  onDependency: () => void;
  onStages: () => void;
}) {
  return (
    <div className="q-row">
      <p className="q-label">Dig in with a question:</p>
      <div className="q-links">
        <button type="button" className="q-link" onClick={onWhereFrom}>
          Where did a setting come from?
        </button>
        <button type="button" className="q-link" onClick={onDependency}>
          What happens to one of my dependencies?
        </button>
        <button type="button" className="q-link" onClick={onStages}>
          What did each stage change?
        </button>
      </div>
    </div>
  );
}

// Roadmap 032: memoized — the digest and its pills change only per run, so
// the landing tab must not re-render per keystroke with them.
export const OverviewTab = memo(function OverviewTab({
  digest,
  banner,
  onOpen,
  onWhereFrom,
}: {
  digest: DigestClause[];
  /** The 023 hypothetical-run banner, when validation reported errors. */
  banner?: ReactNode;
  onOpen: (tab: ResultsTabId) => void;
  /** Opens Effective config AND focuses its filter input. */
  onWhereFrom: () => void;
}) {
  return (
    <div className="overview-tab">
      {banner}
      <RunDigest clauses={digest} onOpen={onOpen} />
      <QuestionPills
        onWhereFrom={onWhereFrom}
        onDependency={() => onOpen("simulator")}
        onStages={() => onOpen("pipeline")}
      />
    </div>
  );
});
