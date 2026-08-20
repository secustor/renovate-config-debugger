import { useState } from "react";
import type { ProvenanceLayer, RuleAttribution } from "@renovate-config-debugger/engine";
import type { FormState } from "./form";
import { GhostPinRow } from "./GhostPinRow";
import { PinCard } from "./PinCard";
import type { PinnedTest } from "./pins";
import type { RuleDescriptionNote } from "./rule-descriptions";
import type { PinEvaluation } from "./use-pinned-tests";

/**
 * Roadmap 075 (iteration 6): the Tests tab's own view — the pinned dependency
 * descriptors and what the CURRENT run's rules do to each of them.
 *
 * No pin is ever created for the reader: an empty list says what a pin is and
 * offers the form, and the simulator (one dependency, the full analysis) stays
 * one quiet link away in both states.
 */

/** Roadmap 077 (Proposal F): pins ride in the share link, said where pins are
 *  made. "Share" is live — the same build-and-copy as the header's button —
 *  with its own inline receipt, since the header's popover is a screen away
 *  from this click. */
function ShareNote({ onShare }: { onShare: () => Promise<void> }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    try {
      await onShare();
    } catch {
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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

function PinsSummary({ count, onOpenSimulator }: { count: number; onOpenSimulator: () => void }) {
  const sentence =
    count === 0
      ? "pinned tests — pin a dependency below and it is re-checked on every run"
      : `pinned test${count === 1 ? "" : "s"} — re-checked on every run`;
  return (
    <div className="summary-strip">
      <strong>{count}</strong>
      <span>{sentence}</span>
      <button type="button" className="btn-quiet" onClick={onOpenSimulator}>
        {count === 0 ? "or explore one dependency in the simulator →" : "open the simulator →"}
      </button>
    </div>
  );
}

export function PinsView({
  pins,
  evaluations,
  layerByIndex,
  attribution,
  descriptions,
  onSelectPreset,
  onJumpToEditor,
  onAddPin,
  onRemovePin,
  onOpenSimulator,
  onOpenPinInSimulator,
  onShare,
}: {
  pins: PinnedTest[];
  evaluations: Record<string, PinEvaluation>;
  layerByIndex: Map<number, ProvenanceLayer>;
  attribution: RuleAttribution[] | null | undefined;
  descriptions: Map<number, RuleDescriptionNote>;
  onSelectPreset?: (nodeId: string) => void;
  onJumpToEditor?: (repoIndex: number) => void;
  onAddPin: (form: FormState) => void;
  onRemovePin: (id: string) => void;
  onOpenSimulator: () => void;
  onOpenPinInSimulator: (pin: PinnedTest) => void;
  /** See {@link ShareNote}; absent (embedding without a share path) = no note. */
  onShare?: () => Promise<void>;
}) {
  const [ghostOpen, setGhostOpen] = useState(false);
  const links = { onSelectPreset, onJumpToEditor };
  return (
    <div className="pins-view">
      <PinsSummary count={pins.length} onOpenSimulator={onOpenSimulator} />
      {pins.length === 0 ? (
        <p className="empty-note">
          A pinned test is a dependency update you describe once. It is re-simulated against your
          rules after every run, so an edit tells you what changed for the updates you actually care
          about.
        </p>
      ) : null}
      {pins.map((pin) => (
        <PinCard
          key={pin.id}
          pin={pin}
          evaluation={evaluations[pin.id]}
          layerByIndex={layerByIndex}
          attribution={attribution}
          descriptions={descriptions}
          links={links}
          onRemove={() => onRemovePin(pin.id)}
          onOpenSimulator={() => onOpenPinInSimulator(pin)}
        />
      ))}
      <GhostPinRow
        open={ghostOpen}
        pinCount={pins.length}
        onOpen={() => setGhostOpen(true)}
        onCancel={() => setGhostOpen(false)}
        onPin={(form) => {
          onAddPin(form);
          setGhostOpen(false);
        }}
      />
      {onShare ? <ShareNote onShare={onShare} /> : null}
    </div>
  );
}
