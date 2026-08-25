import { useState } from "react";
import { useTransientFlag } from "@/hooks/use-transient-flag";
import type {
  ProvenanceLayer,
  RuleAttribution,
  TraceResult,
} from "@renovate-config-debugger/engine";
import { nf } from "@/lib/format";
import { AddTestBox } from "./AddTestBox";
import { EmptyTestsCard } from "./EmptyTestsCard";
import type { FormState } from "./form";
import { PinCard } from "./PinCard";
import type { PinnedTest } from "./pins";
import type { RepoDepsView } from "./repo-deps";
import type { RuleDescriptionNote } from "./rule-descriptions";
import type { PinEvaluation } from "./use-pinned-tests";

/**
 * The Tests tab's own view, as Proposal F draws it: the summary strip
 * ("N pinned · R rules evaluated per test, in merge order" — with the merge
 * law on the right), the funnel card per pin, and the Add-a-test card at the
 * foot — the design's GHOST row once pins exist, open only while a pin is
 * being made (082 revisited alongside 078). No pin is ever created for the
 * reader: the empty state says what a pin is and seeds the form, and the
 * detail view (one dependency, the full analysis) is one quiet link away from
 * every card that HAS a dependency to hand it — roadmap 080 closed the
 * descriptor-less door.
 */

/** Roadmap 077 (Proposal F): pins ride in the share link, said where pins are
 *  made. "Share" is live — the same build-and-copy as the header's button —
 *  with its own inline receipt, since the header's popover is a screen away
 *  from this click. */
function ShareNote({ onShare }: { onShare: () => Promise<void> }) {
  const [copied, flashCopied] = useTransientFlag(1500);
  async function share() {
    try {
      await onShare();
    } catch {
      return;
    }
    flashCopied();
  }
  return (
    <p className="pins-share-note">
      Pins are saved with the share link —{" "}
      <button type="button" className="digest-link" onClick={() => void share()}>
        Share
      </button>{" "}
      in the header copies it.{copied ? <span className="host-ok"> Copied ✓</span> : null}
    </p>
  );
}

function PinsSummary({
  count,
  ruleCount,
}: {
  count: number;
  /** Rules evaluated per test in the current run — from the first finished
   *  evaluation; absent until one lands. */
  ruleCount: number | undefined;
}) {
  const pinned =
    count === 0 ? (
      <span>none pinned</span>
    ) : (
      <span>
        <strong>{count}</strong> pinned
        {ruleCount === undefined
          ? " — re-checked on every run"
          : ` · ${nf.format(ruleCount)} rules evaluated per test, in merge order`}
      </span>
    );
  return (
    <div className="summary-strip">
      {pinned}
      {/* Roadmap 080: no "open the simulator →" here. The detail view is
          reached WITH A SUBJECT — a pin card's or a one-off's "open in
          simulator →", a share link's `sim`, a validation message naming a
          rule; a door that opened it on an empty form was a duplicate of the
          Add-a-test Manual form one screen below. */}
      <span className="pins-strip-note">later rules win on conflict</span>
    </div>
  );
}

export function PinsView({
  result,
  pins,
  evaluations,
  layerByIndex,
  attribution,
  descriptions,
  onSelectPreset,
  onJumpToEditor,
  onAddPin,
  onRemovePin,
  onOpenInSimulator,
  onShare,
  repoDeps,
  onLoadRepoDeps,
}: {
  result: TraceResult;
  pins: PinnedTest[];
  evaluations: Record<string, PinEvaluation>;
  layerByIndex: Map<number, ProvenanceLayer>;
  attribution: RuleAttribution[] | null | undefined;
  descriptions: Map<number, RuleDescriptionNote>;
  onSelectPreset?: (nodeId: string) => void;
  onJumpToEditor?: (repoIndex: number) => void;
  onAddPin: (form: FormState) => void;
  onRemovePin: (id: string) => void;
  /** The descriptor channel into the full simulator — a pin's form, or the
   *  one-off simulation's. Roadmap 080: the ONLY one this view has, since the
   *  strip's descriptor-less door is gone. */
  onOpenInSimulator: (form: FormState) => void;
  /** See {@link ShareNote}; absent (embedding without a share path) = no note. */
  onShare?: () => Promise<void>;
  /** Roadmap 078: the loaded repository's extracted dependencies, and the
   *  on-demand trigger that computes them — both the shell's. */
  repoDeps: RepoDepsView;
  onLoadRepoDeps: () => void;
}) {
  // A quick-start chip seeds the Add-a-test form below — nonce-versioned so
  // the same chip works twice in a row.
  const [seed, setSeed] = useState<{ fill: Partial<FormState>; nonce: number }>({
    fill: {},
    nonce: 0,
  });
  const links = { onSelectPreset, onJumpToEditor };
  const ruleCount = Object.values(evaluations).find((e) => e.sim)?.sim?.rules.length;
  // The merged rule bodies, for the probe's writes field — indexed exactly the
  // way RuleEvaluation.index counts.
  const ruleBodies = Array.isArray(result.finalConfig?.packageRules)
    ? (result.finalConfig.packageRules as readonly unknown[])
    : undefined;
  return (
    <div className="pins-view">
      <PinsSummary count={pins.length} ruleCount={ruleCount} />
      {pins.length === 0 ? (
        <EmptyTestsCard onStartFrom={(fill) => setSeed((s) => ({ fill, nonce: s.nonce + 1 }))} />
      ) : null}
      {pins.map((pin) => (
        <PinCard
          key={pin.id}
          pin={pin}
          evaluation={evaluations[pin.id]}
          layerByIndex={layerByIndex}
          attribution={attribution}
          descriptions={descriptions}
          ruleBodies={ruleBodies}
          links={links}
          onRemove={() => onRemovePin(pin.id)}
          onOpenInSimulator={() => onOpenInSimulator(pin.form)}
        />
      ))}
      <AddTestBox
        result={result}
        layerByIndex={layerByIndex}
        attribution={attribution}
        pins={pins}
        seed={seed.fill}
        seedNonce={seed.nonce}
        repoDeps={repoDeps}
        onLoadRepoDeps={onLoadRepoDeps}
        onAddPin={onAddPin}
        onOpenInSimulator={onOpenInSimulator}
        footnote={onShare ? <ShareNote onShare={onShare} /> : undefined}
      />
    </div>
  );
}
