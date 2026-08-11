import { useState } from "react";
import type {
  DescriptionAttribution,
  DroppedDescription,
  ProvenanceLayer,
} from "@renovate-config-debugger/engine";
import {
  type DescriptionLedger,
  DROPPED_COLLAPSE_AFTER,
  droppedSummaryText,
  duplicateNoteText,
  duplicatePillText,
  hiddenCount,
  LEDGER_COLLAPSE_AFTER,
  ledgerCountText,
  type LedgerGroup,
  type LedgerRow,
  ledgerWriterText,
  moreDroppedText,
  moreEntriesText,
  unattributedNoteText,
  unattributedValueText,
  viaNoteText,
} from "@/lib/description-ledger";
import { dropReasonText } from "@/lib/drop-reasons";
import { CodeText } from "./CodeText";
import { ApproximateMark, DegradedCaveat } from "./DescriptionApprox";
import { ROOT_NODE_ID } from "./preset-tree-stats";
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
 * Code's hidden precedence), and a member that is not text still holding its
 * own line. The only imposed structure is the hairline between consecutive runs
 * of the same top-level extend, which is what makes "which line do I delete"
 * readable at a glance.
 *
 * Every hedge here is the shared one (`DescriptionApprox`, `drop-reasons`): a
 * reader who learned what `≈` means on the Overview's digest card must not meet
 * a differently-worded caveat on this surface.
 */

/**
 * The chip a row wears: the node that WROTE the sentence when there is one
 * (that is the answer the reader came for — usually a preset several levels
 * below the extend they wrote), falling back to the arrival layer for the
 * strings that have no preset tree at all (defaults / global / inherited).
 *
 * The root node falls back too, and for a sharper reason: it is the input
 * config, not a preset, and the tree has no row for it (`flattenTree` starts at
 * the root's children). Chipped as a preset it would be clickable and select a
 * node that never renders — a phantom preset in the detail panel. Its arrival
 * layer is the repo/global/inherited config that actually wrote the sentence,
 * which is both true and, being non-preset, not a jump.
 */
function sourceLayer(entry: DescriptionAttribution): ProvenanceLayer {
  return entry.node && entry.node.nodeId !== ROOT_NODE_ID
    ? { kind: "preset", nodeId: entry.node.nodeId, name: entry.node.name }
    : entry.viaTopLevel;
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
      {/* Named after the chip beside it, whatever that resolved to — the two
          must never disagree about which thing was approximated. */}
      {entry.approximate ? <ApproximateMark name={layerLabel(sourceLayer(entry))} /> : null}
      <ProvenanceChip layer={sourceLayer(entry)} onSelectPreset={onSelectPreset} />
      {via ? <span className="desc-ledger-via">{via}</span> : null}
    </span>
  );
}

/**
 * …and the same cell for a repeat: no chip, because the sentence adds
 * nothing — what it needs instead is where it was already said, and which
 * extend said it a second time.
 *
 * Approximate entries are marked here too. The mark is not decoration: an
 * approximate repeat's arrival layer is the one the engine's fallback assigned,
 * so an unmarked "repo config repeats it" would be a confident accusation
 * against a config that may not have repeated anything (`duplicateNoteText`
 * hedges the wording to match).
 */
function DuplicateSource({ entry }: { entry: DescriptionAttribution }) {
  return (
    <span className="desc-ledger-src">
      {entry.approximate ? <ApproximateMark name={layerLabel(sourceLayer(entry))} /> : null}
      <span className="desc-ledger-dup">{duplicatePillText(entry)}</span>
      <span className="desc-ledger-via">{duplicateNoteText(entry)}</span>
    </span>
  );
}

function LedgerEntryLine({
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

/**
 * A member of the array that is not a string. It has a real index and Renovate
 * really did keep it (`subType: "string"` is a validation WARNING here), so it
 * keeps its line in the ledger — the alternative is an array that renders one
 * member shorter than the "Final value" block above it.
 */
function UnattributedLine({ index, value }: { index: number; value: unknown }) {
  return (
    <li className="desc-ledger-row unattributed">
      <span className="desc-ledger-idx">{index + 1}</span>
      <span className="desc-ledger-text">{unattributedValueText(value)}</span>
      <span className="desc-ledger-src">
        <span className="desc-ledger-via">{unattributedNoteText()}</span>
      </span>
    </li>
  );
}

function LedgerLine({
  row,
  onSelectPreset,
}: {
  row: LedgerRow;
  onSelectPreset?: (nodeId: string) => void;
}) {
  if (row.kind === "unattributed") {
    return <UnattributedLine index={row.index} value={row.value} />;
  }
  return <LedgerEntryLine entry={row.entry} onSelectPreset={onSelectPreset} />;
}

/** One blame run — consecutive rows from the same top-level extend. */
function LedgerRun({
  group,
  onSelectPreset,
}: {
  group: LedgerGroup;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hidden = hiddenCount(group.rows.length, LEDGER_COLLAPSE_AFTER, expanded);
  const shown = hidden > 0 ? group.rows.slice(0, LEDGER_COLLAPSE_AFTER) : group.rows;
  return (
    <ul className="desc-ledger-list">
      {shown.map((row) => (
        <LedgerLine key={row.index} row={row} onSelectPreset={onSelectPreset} />
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
 *  that deleted it — the two halves of "why isn't my description showing up".
 *  Marked when that preset is the engine's enclosing-subtree guess, exactly as
 *  an approximate entry's cell is. */
function DroppedSource({
  drop,
  onSelectPreset,
}: {
  drop: DroppedDescription;
  onSelectPreset?: (nodeId: string) => void;
}) {
  return (
    <span className="desc-ledger-src">
      {drop.approximate ? <ApproximateMark name={drop.node.name} /> : null}
      <ProvenanceChip
        layer={{ kind: "preset", nodeId: drop.node.nodeId, name: drop.node.name }}
        onSelectPreset={onSelectPreset}
      />
      <span className="desc-ledger-via">
        <CodeText text={dropReasonText(drop)} />
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
        {/* The same count the collapsed row shows, from the same function: a
            title claiming more lines than the list has is the exact
            under-reporting the unattributed rows exist to prevent. */}
        Who wrote each line ({ledgerCountText(ledger)}
        {writers ? ` · ${writers}` : null})
      </div>
      {ledger.groups.map((group) => (
        <LedgerRun key={group.key} group={group} onSelectPreset={onSelectPreset} />
      ))}
      {ledger.dropped.length > 0 ? (
        <DroppedSection dropped={ledger.dropped} onSelectPreset={onSelectPreset} />
      ) : null}
      {ledger.degraded ? <DegradedCaveat /> : null}
    </div>
  );
}
