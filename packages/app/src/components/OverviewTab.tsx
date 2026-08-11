import { memo, type ReactNode } from "react";
import type { TraceResult } from "@renovate-config-debugger/engine";
import type { ResultsTabId } from "@/data/results-tabs";
import type { DigestClause } from "@/lib/run-digest";
import { CodeText } from "./CodeText";
import { DescriptionDigestCard } from "./DescriptionDigestCard";

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
  result,
  digest,
  banner,
  onOpen,
  onWhereFrom,
  onSelectPreset,
}: {
  /** Roadmap 069: the run the "What this config does" card reads its
   *  descriptions off. Per-run identity, so the memo still bails on keystrokes. */
  result: TraceResult;
  digest: DigestClause[];
  /** The 023 hypothetical-run banner, when validation reported errors. */
  banner?: ReactNode;
  onOpen: (tab: ResultsTabId) => void;
  /** Opens Effective config AND focuses its filter input. */
  onWhereFrom: () => void;
  /** Selects a preset node in the resolution tree — the digest card's chips
   *  and leaf labels, wired exactly like the effective config's (013). */
  onSelectPreset?: (nodeId: string) => void;
}) {
  return (
    <div className="overview-tab">
      {banner}
      <RunDigest clauses={digest} onOpen={onOpen} />
      <DescriptionDigestCard result={result} onSelectPreset={onSelectPreset} />
      <QuestionPills
        onWhereFrom={onWhereFrom}
        onDependency={() => onOpen("simulator")}
        onStages={() => onOpen("pipeline")}
      />
    </div>
  );
});
