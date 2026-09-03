import { useState } from "react";
import type { ClauseEvaluation } from "@renovate-config-debugger/engine";
import { jsonSnippet } from "@/lib/value-preview";
import { clauseEvaluated, clauseIcon, fullValue } from "./rule-format";

/**
 * Roadmap 054 (variant A): a rule's clause evidence as ALIGNED columns —
 * mark · matcher · what it checks · what this update actually is. The prose
 * form this replaced (layer 7 retired it from the rules drawer too, so there is
 * one clause renderer now) restated "matched against x = y" per row; read as a
 * thread's evidence, three or four of those in a column are a wall. The columns
 * do the restating instead, so the eye compares the two value columns straight
 * down.
 *
 * The row is its own grid element sharing the list's tracks (`subgrid`) rather
 * than four loose cells: a row keeps its own box for state styling, and the
 * matcher/value edges still line up across the whole grid.
 */
function ClauseGridRow({ clause }: { clause: ClauseEvaluation }) {
  // Replay-02 N6: `jsonSnippet` slices the JSON before it reaches the DOM, so
  // the complete clause value — the citable artifact for a long
  // matchSourceUrls array — never existed on the page. A truncated value
  // renders as click-to-expand, with the full value also in its title.
  const [valueExpanded, setValueExpanded] = useState(false);
  const evaluated = clauseEvaluated(clause);
  const preview = jsonSnippet(clause.value, 60);
  const full = fullValue(clause.value);
  return (
    <div className={`kv-row sim-clause-row state-${clause.state}`}>
      <span className="sim-clause-mark">{clauseIcon(clause.state)}</span>
      <code className="sim-clause-key">{clause.key}</code>
      <span className="sim-clause-checks">
        checks{" "}
        {preview === full ? (
          <span className="sim-clause-value">{preview}</span>
        ) : (
          <button
            type="button"
            className="sim-clause-value sim-clause-expand"
            title={valueExpanded ? "Collapse" : full}
            aria-expanded={valueExpanded}
            onClick={() => setValueExpanded(!valueExpanded)}
          >
            {valueExpanded ? full : preview}
          </button>
        )}
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
    <div className="kv sim-clause-grid">
      {clauses.map((clause) => (
        <ClauseGridRow key={clause.key} clause={clause} />
      ))}
    </div>
  );
}
