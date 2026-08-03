import { ProvenanceChip } from "@/components/ProvenanceChip";
import { ClauseGrid } from "./ClauseGrid";
import type { RuleEvidence } from "./rule-evidence";
import { RuleEvidenceAnchor } from "./RuleEvidenceCard";
import type { ThreadEntry, ThreadModel, ThreadVerb, ThreadWinner } from "./verdict-threads";
import { WriteRow } from "./WriteRow";

/**
 * Roadmap 054 (variant A): the expanded thread — the causal story of ONE
 * setting. The winner writes first (the verb carries the merge semantics, so
 * the thread needs no explanatory aside), its clause evidence follows as an
 * aligned grid, and every writer it beat is struck through underneath, newest
 * first, down to the value the key held before any rule ran. The step link is
 * the only thing that navigates away.
 */

const VERB_LABEL: Record<ThreadVerb, string> = {
  set: "set by",
  appended: "appended by",
  removed: "removed by",
};

/**
 * Roadmap 054: the callbacks a thread's body needs to reach the rest of the
 * simulator. Bundled because every level between the ledger and the override
 * line forwards all of them unchanged.
 */
export interface ThreadActions {
  onSelectPreset?: (nodeId: string) => void;
  onJumpToStep?: (stopIndex: number) => void;
  /** Layer 3: the popover's model for a rule, derived off the last run. */
  evidenceFor?: (ruleIndex: number) => RuleEvidence;
  /** Layer 3: the popover footer's jump into the matched-rules drawer. */
  onOpenRule?: (ruleIndex: number) => void;
}

/** How a stop is named in prose: a rule by its canonical `packageRules[N]`
 *  reference (the same text validators and cross-links use), a stop without a
 *  rule by its timeline name. On an OVERRIDE line the reference is also the
 *  popover anchor (layer 3) — that rule's story is elsewhere, unlike the
 *  winner's, whose evidence is already open right below it. */
function WriterRef({
  ruleIndex,
  stopLabel,
  evidence,
}: {
  ruleIndex?: number;
  stopLabel: string;
  evidence?: ThreadActions;
}) {
  if (ruleIndex === undefined) {
    return <span className="sim-thread-stop">the {stopLabel}</span>;
  }
  if (evidence?.evidenceFor) {
    return (
      <RuleEvidenceAnchor
        ruleIndex={ruleIndex}
        evidenceFor={evidence.evidenceFor}
        onOpenRule={evidence.onOpenRule}
        onSelectPreset={evidence.onSelectPreset}
      />
    );
  }
  return <code className="sim-thread-rule">packageRules[{ruleIndex}]</code>;
}

/** The line that says who had the last word, and how. */
function ThreadWriterLine({
  winner,
  verb,
  onSelectPreset,
}: {
  winner: ThreadWinner;
  verb: ThreadVerb;
  onSelectPreset?: (nodeId: string) => void;
}) {
  return (
    <p className="sim-thread-line">
      <b>{VERB_LABEL[verb]}</b>{" "}
      <WriterRef ruleIndex={winner.ruleIndex} stopLabel={winner.stopLabel} />
      {winner.layer ? (
        <span className="sim-thread-chip">
          <ProvenanceChip layer={winner.layer} onSelectPreset={onSelectPreset} />
        </span>
      ) : null}
    </p>
  );
}

/**
 * One value the winner beat — struck through in place, with whoever wrote it.
 * The cascade's last entry is the pre-rules value, which has no writer.
 *
 * Roadmap 054 layer 7: this IS the shared write row (`⊘` mark, a struck value,
 * a trailing note), so a lost value looks the same here as in the evidence
 * card's digest. The row states only a `before` — a beaten write has no "and
 * then it became": that is the winner line at the top of the thread.
 */
function ThreadOverrideLine({
  threadKey,
  entry,
  actions,
}: {
  threadKey: string;
  entry: ThreadEntry;
  actions: ThreadActions;
}) {
  if (entry.kind === "base") {
    return (
      <WriteRow
        name={threadKey}
        mark="⊘"
        max={80}
        before={entry.present ? { json: entry.value } : undefined}
        note={entry.present ? "before any rule" : "nothing was set before any rule"}
      />
    );
  }
  return (
    <WriteRow
      name={threadKey}
      mark="⊘"
      max={80}
      before={{ json: entry.value }}
      note={
        <>
          written by{" "}
          <WriterRef ruleIndex={entry.ruleIndex} stopLabel={entry.stopLabel} evidence={actions} />
        </>
      }
    />
  );
}

/** The jump into the demoted build replay, landing on the winning stop. */
function ThreadStepLine({
  winner,
  onJumpToStep,
}: {
  winner: ThreadWinner;
  onJumpToStep: (stopIndex: number) => void;
}) {
  return (
    <p className="sim-thread-line">
      <button
        type="button"
        className="sim-step-link"
        onClick={() => onJumpToStep(winner.stopIndex)}
      >
        {winner.stopLabel} in the replay →
      </button>
    </p>
  );
}

export function ThreadBody({ thread, actions }: { thread: ThreadModel; actions: ThreadActions }) {
  const { winner } = thread;
  const { onJumpToStep } = actions;
  return (
    <div className="sim-thread-body">
      {winner ? (
        <ThreadWriterLine
          winner={winner}
          verb={thread.verb}
          onSelectPreset={actions.onSelectPreset}
        />
      ) : (
        <p className="sim-thread-line">No merge step names this setting.</p>
      )}
      {winner && winner.clauses.length > 0 ? <ClauseGrid clauses={winner.clauses} /> : null}
      <div className="kv sim-writes">
        {thread.overrides.map((entry) => (
          <ThreadOverrideLine
            key={entry.kind === "base" ? "base" : `stop-${entry.stopIndex}`}
            threadKey={thread.key}
            entry={entry}
            actions={actions}
          />
        ))}
      </div>
      {winner && onJumpToStep ? (
        <ThreadStepLine winner={winner} onJumpToStep={onJumpToStep} />
      ) : null}
    </div>
  );
}
