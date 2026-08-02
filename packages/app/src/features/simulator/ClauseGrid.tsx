import type { ClauseEvaluation } from "@renovate-config-visualizer/engine";
import { clauseEvaluated, clauseIcon, previewValue } from "./rule-format";

/**
 * Roadmap 053 (variant A): a rule's clause evidence as ALIGNED columns —
 * mark · matcher · what it checks · what this update actually is. The prose
 * form (`.sim-clauses`, still what the rules drawer uses) restates "matched
 * against x = y" per row; read as a thread's evidence, three or four of those
 * in a column are a wall. The columns do the restating instead, so the eye
 * compares the two value columns straight down.
 *
 * The row is its own grid element sharing the list's tracks (`subgrid`) rather
 * than four loose cells: a row keeps its own box for state styling, and the
 * matcher/value edges still line up across the whole grid.
 */
function ClauseGridRow({ clause }: { clause: ClauseEvaluation }) {
  const evaluated = clauseEvaluated(clause);
  return (
    <div className={`sim-clause-row state-${clause.state}`}>
      <span className="sim-clause-mark">{clauseIcon(clause.state)}</span>
      <code className="sim-clause-key">{clause.key}</code>
      <span className="sim-clause-checks">
        checks <span className="sim-clause-value">{previewValue(clause.value, 60)}</span>
      </span>
      <span className="sim-clause-evaluated">
        {`· ${evaluated.text}`}
        {evaluated.value === undefined ? null : (
          <span className="sim-clause-value"> {evaluated.value}</span>
        )}
      </span>
    </div>
  );
}

/** The clause evidence of one rule — matched clauses read as the two-part
 *  "checks … · this update is …" pair, every other state keeps the precise
 *  022 explanation (so this grid also serves rules that did NOT match). */
export function ClauseGrid({ clauses }: { clauses: ClauseEvaluation[] }) {
  return (
    <div className="sim-clause-grid">
      {clauses.map((clause) => (
        <ClauseGridRow key={clause.key} clause={clause} />
      ))}
    </div>
  );
}
