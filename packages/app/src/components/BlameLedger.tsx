import { useState } from "react";
import type {
  DescriptionAttribution,
  DroppedDescription,
  ProvenanceLayer,
} from "@renovate-config-debugger/engine";
import {
  type DescriptionLedger,
  DROPPED_COLLAPSE_AFTER,
  droppedReasonText,
  droppedSummaryText,
  duplicateNoteText,
  duplicatePillText,
  hiddenCount,
  LEDGER_COLLAPSE_AFTER,
  type LedgerGroup,
  ledgerWriterText,
  moreDroppedText,
  moreEntriesText,
  viaNoteText,
} from "@/lib/description-ledger";
import { CodeText } from "./CodeText";
import { layerLabel } from "./provenance-layer";
import { ProvenanceChip } from "./ProvenanceChip";

/**
 * Roadmap 069 (PR 3): the `description` row of the Effective config, expanded —
 * the same flat array Renovate produced, with every string attributed to the
 * preset that wrote it. `git blame` for prose.
 *
 * Why this replaces the row's generic override-chain rendering rather than
 * joining it: for a mergeable array the chain says "extends[0] appends 15,
 * extends[1] appends 1" and prints the whole array three times over, which is
 * both bulkier and strictly less informative than naming the author of each
 * line. Every other key keeps the chain.
 *
 * The order is the final array's, unaltered — nothing sorted, nothing folded,
 * duplicates struck through rather than removed (DevTools' cascade, not VS
 * Code's hidden precedence). The only imposed structure is the hairline
 * between consecutive runs of the same top-level extend, which is what makes
 * "which line do I delete" readable at a glance.
 */

/** The chip a row wears: the node that WROTE the sentence when there is one
 *  (that is the answer the reader came for — usually a preset several levels
 *  below the extend they wrote), falling back to the arrival layer for the
 *  strings that have no preset tree at all (defaults / global / inherited). */
function sourceLayer(entry: DescriptionAttribution): ProvenanceLayer {
  return entry.node
    ? { kind: "preset", nodeId: entry.node.nodeId, name: entry.node.name }
    : entry.viaTopLevel;
}

/** 069 PR 1's honest fallback, in PR 2's marking: the attribution is to an
 *  enclosing subtree, not a leaf, so the chip is prefixed rather than trusted. */
function ApproximateMark({ name }: { name: string }) {
  return (
    <span
      className="desc-ledger-approx"
      title={`Contributed somewhere inside ${name} — the exact preset could not be determined`}
    >
      ≈
    </span>
  );
}

/** The third cell of a normal row: who wrote it, and which extend carried it. */
function LedgerSource({
  entry,
  onSelectPreset,
}: {
  entry: DescriptionAttribution;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const via = viaNoteText(entry);
  return (
    <span className="desc-ledger-src">
      {entry.approximate ? (
        <ApproximateMark name={entry.node?.name ?? layerLabel(entry.viaTopLevel)} />
      ) : null}
      <ProvenanceChip layer={sourceLayer(entry)} onSelectPreset={onSelectPreset} />
      {via ? <span className="desc-ledger-via">{via}</span> : null}
    </span>
  );
}

/** …and the same cell for a repeat: no chip, because the sentence adds
 *  nothing — what it needs instead is where it was already said, and which
 *  extend said it a second time. */
function DuplicateSource({ entry }: { entry: DescriptionAttribution }) {
  return (
    <span className="desc-ledger-src">
      <span className="desc-ledger-dup">{duplicatePillText(entry)}</span>
      <span className="desc-ledger-via">{duplicateNoteText(entry)}</span>
    </span>
  );
}

function LedgerRow({
  entry,
  onSelectPreset,
}: {
  entry: DescriptionAttribution;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const duplicate = entry.duplicateOfIndex !== undefined;
  return (
    <li className={`desc-ledger-row${duplicate ? " duplicate" : ""}`}>
      <span className="desc-ledger-idx">{entry.index + 1}</span>
      <span className="desc-ledger-text">
        <CodeText text={entry.value} />
      </span>
      {duplicate ? (
        <DuplicateSource entry={entry} />
      ) : (
        <LedgerSource entry={entry} onSelectPreset={onSelectPreset} />
      )}
    </li>
  );
}

/** One blame run — consecutive strings from the same top-level extend. */
function LedgerRun({
  group,
  onSelectPreset,
}: {
  group: LedgerGroup;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hidden = hiddenCount(group.entries.length, LEDGER_COLLAPSE_AFTER, expanded);
  const shown = hidden > 0 ? group.entries.slice(0, LEDGER_COLLAPSE_AFTER) : group.entries;
  return (
    <ul className="desc-ledger-list">
      {shown.map((entry) => (
        <LedgerRow key={entry.index} entry={entry} onSelectPreset={onSelectPreset} />
      ))}
      {hidden > 0 ? (
        <li className="desc-ledger-more">
          <button type="button" className="linklike" onClick={() => setExpanded(true)}>
            {moreEntriesText(hidden, group.layer)}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

/** A dropped description's cell: the preset that authored it, and the rule
 *  that deleted it — the two halves of "why isn't my description showing up". */
function DroppedSource({
  drop,
  onSelectPreset,
}: {
  drop: DroppedDescription;
  onSelectPreset?: (nodeId: string) => void;
}) {
  return (
    <span className="desc-ledger-src">
      <ProvenanceChip
        layer={{ kind: "preset", nodeId: drop.node.nodeId, name: drop.node.name }}
        onSelectPreset={onSelectPreset}
      />
      <span className="desc-ledger-via">
        <CodeText text={droppedReasonText(drop)} />
      </span>
    </span>
  );
}

function DroppedRow({
  drop,
  onSelectPreset,
}: {
  drop: DroppedDescription;
  onSelectPreset?: (nodeId: string) => void;
}) {
  return (
    <li className="desc-ledger-row dropped">
      <span className="desc-ledger-idx" aria-hidden="true">
        ·
      </span>
      <span className="desc-ledger-text">
        <CodeText text={drop.value} />
      </span>
      <DroppedSource drop={drop} onSelectPreset={onSelectPreset} />
    </li>
  );
}

function DroppedList({
  dropped,
  onSelectPreset,
}: {
  dropped: readonly DroppedDescription[];
  onSelectPreset?: (nodeId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hidden = hiddenCount(dropped.length, DROPPED_COLLAPSE_AFTER, expanded);
  const shown = hidden > 0 ? dropped.slice(0, DROPPED_COLLAPSE_AFTER) : dropped;
  return (
    <ul className="desc-ledger-list">
      {shown.map((drop, i) => (
        // Roadmap 041 — index key, deliberately: a dropped description has no
        // id of its own, and the same preset can drop the same sentence twice
        // (two `extends` entries reaching it). The list is derived from one
        // immutable run and never reorders, so position IS the identity.
        // oxlint-disable-next-line react/no-array-index-key -- see above
        <DroppedRow key={i} drop={drop} onSelectPreset={onSelectPreset} />
      ))}
      {hidden > 0 ? (
        <li className="desc-ledger-more">
          <button type="button" className="linklike" onClick={() => setExpanded(true)}>
            {moreDroppedText(hidden)}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

/**
 * The quiet footer. Three Renovate quirks delete a description before it can
 * merge (069 PR 1) — including `config:best-practices`' own one-liner — and
 * "my preset's description is missing" is otherwise an unanswerable question.
 * Muted and closed by default: it is a footnote, and on a real config the
 * `ignoreDeps: []` mute alone drops 135 sentences.
 */
function DroppedSection({
  dropped,
  onSelectPreset,
}: {
  dropped: readonly DroppedDescription[];
  onSelectPreset?: (nodeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="desc-ledger-dropped">
      <button
        type="button"
        className="linklike"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {droppedSummaryText(dropped)}
      </button>
      {open ? <DroppedList dropped={dropped} onSelectPreset={onSelectPreset} /> : null}
    </div>
  );
}

export function BlameLedger({
  ledger,
  onSelectPreset,
}: {
  ledger: DescriptionLedger;
  /** Selects the node in the Preset Resolution Tree — the same callback every
   *  other chip in this view gets (013). */
  onSelectPreset?: (nodeId: string) => void;
}) {
  const writers = ledgerWriterText(ledger);
  return (
    <div className="desc-ledger">
      <div className="prov-chain-title">
        Who wrote each line ({ledger.entryCount}
        {writers ? ` · ${writers}` : null})
      </div>
      {ledger.groups.map((group) => (
        <LedgerRun key={group.key} group={group} onSelectPreset={onSelectPreset} />
      ))}
      {ledger.dropped.length > 0 ? (
        <DroppedSection dropped={ledger.dropped} onSelectPreset={onSelectPreset} />
      ) : null}
      {ledger.degraded ? (
        <p className="desc-ledger-caveat">
          Some sentences could not be traced to the exact preset that wrote them — those are marked
          with the enclosing preset and a <code>≈</code>. The wording and the order are still
          Renovate’s own.
        </p>
      ) : null}
    </div>
  );
}
