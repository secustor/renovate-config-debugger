import { ProvenanceChip } from "@/components/ProvenanceChip";
import { ClauseGrid } from "./ClauseGrid";
import type { RuleEvidence } from "./rule-evidence";
import { RuleEvidenceAnchor } from "./RuleEvidenceCard";
import { previewValue } from "./rule-format";
import type { ThreadEntry, ThreadModel, ThreadVerb, ThreadWinner } from "./verdict-threads";

/**
 * Roadmap 053 (variant A): the expanded thread — the causal story of ONE
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
 * Roadmap 053: the callbacks a thread's body needs to reach the rest of the
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

/** One value the winner beat — struck through in place, with whoever wrote it.
 *  The cascade's last entry is the pre-rules value, which has no writer. */
function ThreadOverrideLine({ entry, actions }: { entry: ThreadEntry; actions: ThreadActions }) {
  if (entry.kind === "base") {
    if (!entry.present) {
      return <p className="sim-thread-line">nothing was set before any rule</p>;
    }
    return (
      <p className="sim-thread-line">
        <b>overrode</b> <span className="sim-thread-old">{previewValue(entry.value, 80)}</span>{" "}
        <span className="sim-thread-note">before any rule</span>
      </p>
    );
  }
  return (
    <p className="sim-thread-line">
      <b>overrode</b> <span className="sim-thread-old">{previewValue(entry.value, 80)}</span>{" "}
      written by{" "}
      <WriterRef ruleIndex={entry.ruleIndex} stopLabel={entry.stopLabel} evidence={actions} />
    </p>
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
      {thread.overrides.map((entry) => (
        <ThreadOverrideLine
          key={entry.kind === "base" ? "base" : `stop-${entry.stopIndex}`}
          entry={entry}
          actions={actions}
        />
      ))}
      {winner && onJumpToStep ? (
        <ThreadStepLine winner={winner} onJumpToStep={onJumpToStep} />
      ) : null}
    </div>
  );
}
