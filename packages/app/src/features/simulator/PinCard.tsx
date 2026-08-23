import { useMemo, useState } from "react";
import type { ProvenanceLayer, RuleAttribution } from "@renovate-config-debugger/engine";
import { buildPinOutcome, headSummary, pinCheck, type PinOutcome } from "./pin-outcome";
import { Caret } from "@/components/Caret";
import { OpenInSimulatorLink } from "./OpenInSimulatorLink";
import { PinBucketList } from "./PinBucketList";
import { PinHeadRow } from "./PinHeadRow";
import { pinContext, pinName, type PinnedTest } from "./pins";
import { PinProbe } from "./PinProbe";
import { type CrossLinks, PinFailedSection, PinMatchedSection } from "./PinRuleSections";
import type { RuleDescriptionNote } from "./rule-descriptions";
import type { PinEvaluation } from "./use-pinned-tests";

/**
 * One pinned test as the design's funnel card (Proposal F / "Skip Reason
 * Funnel"): a header row that answers the question at a glance — caret, dot,
 * dependency, version move, and the outcome sentence with its counts — and an
 * expansion that IS the funnel: the matched rules with their evidence, the
 * reader's own missed rules with their checklists, the skip buckets by
 * reason, and the probe.
 *
 * Everything it renders comes from `buildPinOutcome`; the card itself decides
 * only what is on screen.
 */

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
  const check = pinCheck(evaluation, outcome);
  return (
    <div className="pin-head">
      <button type="button" className="pin-head-toggle" aria-expanded={expanded} onClick={onToggle}>
        <Caret open={expanded} />
        <PinHeadRow
          check={check}
          name={name}
          context={pinContext(pin.form, outcome?.updateType ?? "")}
          summary={outcome ? headSummary(outcome) : null}
          pending={evaluation ? "not checked" : "checking…"}
        />
      </button>
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
  layerByIndex,
  attribution,
  descriptions,
  ruleBodies,
  subject,
  links,
  onOpenInSimulator,
}: {
  outcome: PinOutcome | null;
  evaluation: PinEvaluation | undefined;
  layerByIndex: Map<number, ProvenanceLayer>;
  attribution: RuleAttribution[] | null | undefined;
  descriptions: Map<number, RuleDescriptionNote>;
  ruleBodies?: readonly unknown[];
  subject: string;
  links: CrossLinks;
  onOpenInSimulator: () => void;
}) {
  // The probe's query lives here rather than in `PinProbe` because a bucket
  // row's "probe" button is the other writer.
  const [probeQuery, setProbeQuery] = useState("");
  if (!outcome || !evaluation?.sim) {
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
      <PinMatchedSection rules={outcome.matched} descriptions={descriptions} links={links} />
      <PinFailedSection rules={outcome.failed} descriptions={descriptions} links={links} />
      <PinBucketList buckets={outcome.buckets} onProbe={setProbeQuery} />
      <PinProbe
        sim={evaluation.sim}
        layerByIndex={layerByIndex}
        attribution={attribution}
        descriptions={descriptions}
        ruleBodies={ruleBodies}
        subject={subject}
        query={probeQuery}
        onQueryChange={setProbeQuery}
        onSelectPreset={links.onSelectPreset}
      />
      <OpenInSimulatorLink onClick={onOpenInSimulator} />
    </div>
  );
}

export function PinCard({
  pin,
  evaluation,
  layerByIndex,
  attribution,
  descriptions,
  ruleBodies,
  links,
  onRemove,
  onOpenInSimulator,
}: {
  pin: PinnedTest;
  evaluation: PinEvaluation | undefined;
  layerByIndex: Map<number, ProvenanceLayer>;
  attribution: RuleAttribution[] | null | undefined;
  descriptions: Map<number, RuleDescriptionNote>;
  /** `finalConfig.packageRules` — makes the probe's writes field searchable. */
  ruleBodies?: readonly unknown[];
  links: CrossLinks;
  onRemove: () => void;
  onOpenInSimulator: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Derived from the pin's own simulation only — a run's worth of rules is
  // walked once per pin per run, never per render of the list around it.
  const outcome = useMemo(
    () =>
      evaluation?.sim
        ? buildPinOutcome(evaluation.sim, layerByIndex, attribution, pinName(pin.form))
        : null,
    [evaluation, layerByIndex, attribution, pin],
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
          layerByIndex={layerByIndex}
          attribution={attribution}
          descriptions={descriptions}
          ruleBodies={ruleBodies}
          subject={[
            pinName(pin.form),
            pin.form.manager.trim() || pin.form.datasource.trim(),
            outcome?.updateType ?? pin.form.updateType,
          ]
            .filter((part) => part !== "")
            .join(" · ")}
          links={links}
          onOpenInSimulator={onOpenInSimulator}
        />
      ) : null}
    </div>
  );
}
