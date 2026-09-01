import { memo, useEffect, useMemo, useState } from "react";
import type { TraceResult } from "@renovate-config-debugger/engine";
import {
  buildDescriptionDigest,
  type DescriptionDigest,
  hasTopLevelDescriptions,
  unattributedNoteText,
} from "./description-digest";
import { groupByTopic, OTHER_TOPIC_ID, type TopicGroup } from "./description-topics";
import { useDescriptionProvenance } from "@/hooks/description-provenance";
import { CodeText } from "@/components/CodeText";
import { DegradedCaveat } from "@/components/DescriptionApprox";
import { nf } from "@/lib/format";
import { type OverviewRow, overviewRows } from "./rows";
import { LayerSource } from "@/components/LayerSource";
import { layerClass } from "@/lib/provenance-layer";
import { ROOT_NODE_ID } from "@/lib/preset-tree-stats";

/**
 * Roadmap 083 — the Overview tab: "What this config does".
 *
 * 069 built this surface as a card grouped by `extends` entry, and 075 parked
 * it at the top of the Effective config when the Overview tab retired. The
 * design's Final artboard brings the tab back and reframes the card for the
 * reader who has not read Renovate's docs: the same author-written sentences,
 * sorted by TOPIC rather than by preset, one chip per row saying who wrote it,
 * and an "Everything else" tail behind a single toggle so nothing is hidden.
 *
 * Everything visible is still derived, and by the same modules: the grouping
 * and counts by `buildDescriptionDigest` (headless), the attribution by the
 * engine's `computeDescriptionProvenance`, the topics by
 * `description-topics.ts` (a documented keyword match, and nothing more).
 * The card renders them and invents nothing.
 */

/** The right-hand end of a row: who wrote this sentence.
 *
 *  Preset sentences wear the standard `PresetName` token — purple mono, the
 *  standard hover card, clickable through to the node in the resolution tree
 *  (081's "one preset name, one preset hover"). Everything else wears its
 *  layer's `ProvenanceChip`, which for the reader's own config is the blue
 *  `repo config` pill the design draws, with the glossary card explaining
 *  Renovate's merge order behind it. Both of those are `LayerSource`'s job; what
 *  is this row's own is WHICH preset counts as the writer. */
function RowSource({
  row,
  onSelectPreset,
}: {
  row: OverviewRow;
  onSelectPreset?: (nodeId: string) => void;
}) {
  // The root node is the repo's own config and has no row in the preset tree,
  // so a token there would offer "show it in the preset tree" and select a node
  // that never renders. Falls through to the layer chip, which says `repo
  // config` — which is the answer.
  const leaf = row.node && row.node.nodeId !== ROOT_NODE_ID ? row.node : undefined;
  const preset =
    leaf ??
    (row.layer.kind === "preset" ? { nodeId: row.layer.nodeId, name: row.layer.name } : null);
  return (
    <LayerSource
      className="overview-source"
      preset={preset}
      layer={row.layer}
      approximate={row.approximate}
      // The token beside it, whatever that resolved to — a row that fell
      // through to the chip has no leaf label to name, and the bare `≈` is
      // exactly the case `ApproximateMark` exists for.
      approximateName={preset?.name}
      onSelectPreset={onSelectPreset}
    />
  );
}

/** One sentence: the layer's dot, the prose, and the source chip. */
function TopicRowView({
  row,
  onSelectPreset,
}: {
  row: OverviewRow;
  onSelectPreset?: (nodeId: string) => void;
}) {
  return (
    // The rule provenance as a tooltip: the design gives a row three slots and
    // no fourth, and `packageRules[0] — matchUpdateTypes → automerge` is a
    // pointer for the reader who already knows what they wrote, not part of the
    // sentence. The editor cross-link in Problems is the surface that acts on
    // it. A `title` never reaches keyboard or screen-reader users, so the same
    // citation rides along visually hidden.
    <li className="overview-row" title={row.note}>
      <span className={`prov-dot ${layerClass(row.layer)}`} aria-hidden="true" />
      <span className="overview-text">
        <CodeText text={row.text} />
        {row.note === undefined ? null : <span className="visually-hidden"> — {row.note}</span>}
      </span>
      <RowSource row={row} onSelectPreset={onSelectPreset} />
    </li>
  );
}

/** One topic: the uppercase title and its sentences. */
function TopicGroupBlock({
  group,
  onSelectPreset,
}: {
  group: TopicGroup<OverviewRow>;
  onSelectPreset?: (nodeId: string) => void;
}) {
  return (
    <div className="overview-topic">
      <p className="overview-topic-title">{group.title}</p>
      <ul className="overview-rows">
        {group.rows.map((row) => (
          <TopicRowView key={row.key} row={row} onSelectPreset={onSelectPreset} />
        ))}
      </ul>
    </div>
  );
}

/** The card's opening line, with `show raw order` riding along on the right.
 *  No card title above it: the tab strip already says "Overview", and the
 *  behavior count is the tab's badge (`onStats`), so restating either here was
 *  saying it twice. */
function OverviewIntro({ onShowRawOrder }: { onShowRawOrder?: () => void }) {
  return (
    <div className="overview-intro">
      <p className="overview-intro-text">
        Every preset carries a sentence describing what it does. Here they are, sorted by topic
        instead of by preset.
      </p>
      {onShowRawOrder ? (
        <button
          type="button"
          className="btn-quiet overview-raw"
          title="Open the description row in the Effective config — every sentence in Renovate's own array order, repeats included, with the preset that wrote it"
          onClick={onShowRawOrder}
        >
          show raw order
        </button>
      ) : null}
    </div>
  );
}

/** The ONE disclosure on this card: the unmatched tail, hidden or shown. */
function TailToggle({
  count,
  open,
  onToggle,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="btn-quiet overview-more" onClick={onToggle}>
      {open ? "show less" : `${nf.format(count)} more in “Everything else” — show all`}
    </button>
  );
}

/** The design's closing line — the card explaining where its own content comes
 *  from, and how the reader adds to it. */
function OverviewFooter() {
  return (
    <p className="overview-footer">
      Every sentence here is pulled from a <code>description</code> field. Add one to your own{" "}
      <code>packageRules</code> or presets and it will show up here.
    </p>
  );
}

/** What the topics could not say: array members that are not text, and the
 *  caveat a degraded run carries. Both are 069 promises the artboard does not
 *  draw and neither is optional — see `DescriptionApprox`. */
function OverviewFootnotes({ digest }: { digest: DescriptionDigest }) {
  const note = unattributedNoteText(digest);
  return (
    <>
      {note ? <p className="overview-aside">{note}</p> : null}
      {digest.degraded ? <DegradedCaveat /> : null}
    </>
  );
}

interface Props {
  result: TraceResult;
  /** Selects a node in the Preset Resolution Tree — the same callback every
   *  other preset token in the app is handed. */
  onSelectPreset?: (nodeId: string) => void;
  /** Opens the Effective config's `description` row, whose blame ledger keeps
   *  the final array's own order — the fact this card trades away twice over
   *  (by regrouping, and by dropping repeats). */
  onShowRawOrder?: () => void;
  /**
   * Reports the behavior count for the tab badge, the way the effective-config
   * view reports its tallies. Called only once provenance has SETTLED: the
   * derivation is async, and a zero published while it is still loading is a
   * badge claiming this config does nothing.
   */
  onStats?: (behaviors: number) => void;
}

// Roadmap 032: memoized like the sibling panels — every prop is
// identity-stable in App, so a `panels` rebuild reconciles this but re-renders
// it only when the run itself changed.
export const OverviewPanel = memo(function OverviewPanel({
  result,
  onSelectPreset,
  onShowRawOrder,
  onStats,
}: Props) {
  const provenance = useDescriptionProvenance(result);
  // Owned HERE, not by the group that renders the button. Provenance for a new
  // run arrives asynchronously, so every re-run has a frame with no digest at
  // all; this component is the one the tab shell keeps mounted through that
  // gap, so a reveal made before an edit survives the edit.
  const [showTail, setShowTail] = useState(false);

  const digest = useMemo(() => {
    if (!provenance) {
      return null;
    }
    const rules = result.finalConfig?.packageRules;
    return buildDescriptionDigest(provenance, Array.isArray(rules) ? rules : null);
  }, [provenance, result]);

  const rows = useMemo(() => (digest ? overviewRows(digest) : []), [digest]);
  const groups = useMemo(() => groupByTopic(rows), [rows]);

  const settled = provenance !== undefined;
  // The tab badge's count: counted from the ROWS listed in the card, never
  // from the digest's own tallies of the top-level `description` array, which
  // exclude the repo's `packageRules` prose (082 — a badge quoting a number
  // the reader cannot get by counting the rows under it is uncheckable).
  const count = rows.length;
  useEffect(() => {
    if (settled) {
      onStats?.(count);
    }
  }, [settled, count, onStats]);

  // Nothing at all while the derivation is in flight — including the frame
  // between two runs. An empty note there would flash "no descriptions" at a
  // reader whose config is full of them.
  if (!settled) {
    return null;
  }
  if (!digest) {
    return (
      <p className="empty-note">
        No descriptions — neither this config nor the presets it extends carry a{" "}
        <code>description</code> sentence.
      </p>
    );
  }

  const tail = groups.find((group) => group.id === OTHER_TOPIC_ID) ?? null;
  const shown = tail && !showTail ? groups.filter((group) => group !== tail) : groups;
  return (
    // No `.card` chrome — the tab panel is frame enough. `overview-card`
    // styles nothing: it is the handle the e2e suite and the panel test grab
    // this block by.
    <div className="overview-card">
      <div className="overview-body">
        <OverviewIntro
          // Only when there IS a `description` row to land on: a digest built
          // purely from the repo's own `packageRules` prose has no top-level
          // array, so the link would filter the Effective config down to a key
          // that isn't there and land on "No keys match".
          onShowRawOrder={
            onShowRawOrder && hasTopLevelDescriptions(digest) ? onShowRawOrder : undefined
          }
        />
        {shown.map((group) => (
          <TopicGroupBlock key={group.id} group={group} onSelectPreset={onSelectPreset} />
        ))}
        {tail ? (
          <TailToggle
            count={tail.rows.length}
            open={showTail}
            onToggle={() => setShowTail((open) => !open)}
          />
        ) : null}
      </div>
      <OverviewFootnotes digest={digest} />
      <OverviewFooter />
    </div>
  );
});
