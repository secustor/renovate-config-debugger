import { useMemo, useState } from "react";
import type { ProvenanceLayer, RuleAttribution } from "@renovate-config-debugger/engine";
import { buildPinOutcome, type PinOutcome } from "./pin-outcome";
import { PinChips } from "./PinChips";
import { PinRuleList } from "./PinRuleList";
import { pinContext, pinName, type PinnedTest } from "./pins";
import type { RuleDescriptionNote } from "./rule-descriptions";
import { SkippedBucket } from "./SkippedBucket";
import type { PinEvaluation } from "./use-pinned-tests";

/**
 * Roadmap 075 (iteration 6): one pinned test, as the design's card — a header
 * row that answers the question at a glance (dot, dependency, outcome chips)
 * and an expansion that says which rules produced that answer.
 *
 * Everything it renders comes from `buildPinOutcome`; the card itself decides
 * only what is on screen.
 */

interface CrossLinks {
  onSelectPreset?: (nodeId: string) => void;
  onJumpToEditor?: (repoIndex: number) => void;
}

/** The header dot. Amber is reserved for "this verdict may not be the truth" —
 *  a simulation that failed, or the 023/replay-02 caveat that one of the
 *  reader's OWN rules lost to a field they left unset. There is no expectation
 *  model yet, so a verdict the tool is confident about is green whatever it
 *  says. */
function dotTone(evaluation: PinEvaluation | undefined, outcome: PinOutcome | null): string {
  if (!evaluation) {
    return "pending";
  }
  return evaluation.error !== undefined || outcome?.caveat !== undefined ? "warn" : "ok";
}

function PinCardHead({
  pin,
  evaluation,
  outcome,
  expanded,
  onToggle,
  onRemove,
}: {
  pin: PinnedTest;
  evaluation: PinEvaluation | undefined;
  outcome: PinOutcome | null;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const name = pinName(pin.form);
  return (
    <div className="pin-head">
      <button type="button" className="pin-head-toggle" aria-expanded={expanded} onClick={onToggle}>
        <span className={`pin-dot ${dotTone(evaluation, outcome)}`} aria-hidden="true" />
        <span className="pin-name">{name}</span>
        <span className="pin-meta">{pinContext(pin.form, outcome?.updateType ?? "")}</span>
      </button>
      {outcome ? (
        <PinChips
          chips={outcome.chips}
          matched={outcome.matched.length}
          total={outcome.totalRules}
        />
      ) : (
        <span className="pin-pending">{evaluation ? "not checked" : "checking…"}</span>
      )}
      <button
        type="button"
        className="btn-quiet pin-remove"
        onClick={onRemove}
        aria-label={`Remove the pinned test for ${name}`}
      >
        ×
      </button>
    </div>
  );
}

function PinCardBody({
  outcome,
  evaluation,
  descriptions,
  links,
  onOpenSimulator,
}: {
  outcome: PinOutcome | null;
  evaluation: PinEvaluation | undefined;
  descriptions: Map<number, RuleDescriptionNote>;
  links: CrossLinks;
  onOpenSimulator: () => void;
}) {
  if (!outcome) {
    return (
      <p className="empty-note">
        {evaluation?.error
          ? `This pin could not be checked: ${evaluation.error}`
          : "Checking this pin against the rules…"}
      </p>
    );
  }
  return (
    <div className="pin-body">
      {outcome.caveat ? <p className="sim-verdict-caveat">⚠ {outcome.caveat}</p> : null}
      <PinRuleList
        title={`✓ ${outcome.matched.length} matched`}
        rules={outcome.matched}
        descriptions={descriptions}
        onSelectPreset={links.onSelectPreset}
        onJumpToEditor={links.onJumpToEditor}
      />
      {outcome.failed.length > 0 ? (
        <PinRuleList
          title={`✗ ${outcome.failed.length} of your own rules didn’t match`}
          rules={outcome.failed}
          onSelectPreset={links.onSelectPreset}
          onJumpToEditor={links.onJumpToEditor}
        />
      ) : null}
      {outcome.buckets.map((bucket) => (
        <SkippedBucket key={bucket.id} bucket={bucket} />
      ))}
      <button type="button" className="btn-quiet pin-open-sim" onClick={onOpenSimulator}>
        open in simulator →
      </button>
    </div>
  );
}

export function PinCard({
  pin,
  evaluation,
  layerByIndex,
  attribution,
  descriptions,
  links,
  onRemove,
  onOpenSimulator,
}: {
  pin: PinnedTest;
  evaluation: PinEvaluation | undefined;
  layerByIndex: Map<number, ProvenanceLayer>;
  attribution: RuleAttribution[] | null | undefined;
  descriptions: Map<number, RuleDescriptionNote>;
  links: CrossLinks;
  onRemove: () => void;
  onOpenSimulator: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Derived from the pin's own simulation only — a run's worth of rules is
  // walked once per pin per run, never per render of the list around it.
  const outcome = useMemo(
    () => (evaluation?.sim ? buildPinOutcome(evaluation.sim, layerByIndex, attribution) : null),
    [evaluation, layerByIndex, attribution],
  );
  return (
    <div className="card pin-card">
      <PinCardHead
        pin={pin}
        evaluation={evaluation}
        outcome={outcome}
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        onRemove={onRemove}
      />
      {expanded ? (
        <PinCardBody
          outcome={outcome}
          evaluation={evaluation}
          descriptions={descriptions}
          links={links}
          onOpenSimulator={onOpenSimulator}
        />
      ) : null}
    </div>
  );
}
