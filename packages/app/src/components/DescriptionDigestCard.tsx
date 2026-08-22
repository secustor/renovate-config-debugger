import { useCallback, useMemo, useState } from "react";
import type { TraceResult } from "@renovate-config-debugger/engine";
import {
  buildDescriptionDigest,
  type DescriptionDigest,
  descriptionCountText,
  type DigestEntry,
  type DigestGroup,
  type DigestRule,
  groupContributionText,
  hasTopLevelDescriptions,
  ruleNoteText,
  unattributedNoteText,
} from "@/lib/description-digest";
import { useDescriptionProvenance } from "@/hooks/description-provenance";
import { CodeText } from "./CodeText";
import { ApproximateMark, DegradedCaveat } from "./DescriptionApprox";
import { PresetName } from "./PresetName";
import { ROOT_NODE_ID } from "@/lib/preset-tree-stats";
import { ProvenanceChip } from "./ProvenanceChip";
import { layerClass } from "./provenance-layer";

/**
 * Roadmap 069 (PR 2): "What this config does" — the flagship surface of the
 * description feature. It was the Overview's second card; since 075 retired
 * that tab it leads the Effective config, whose `description` row is what its
 * "show raw order" link lands on.
 *
 * Every preset carries a sentence its author wrote about what it does, and the
 * resolved config carries all of them concatenated into one anonymous array.
 * Read end to end they are the best plain-English answer to "what did I just
 * extend"; grouped by the `extends` entry that pulled each one in, they also
 * answer "which preset do I remove to stop doing that" — the same question.
 *
 * Everything visible here is derived: the grouping and the counts by
 * `buildDescriptionDigest` (headless, so the CLI can quote it), the attribution
 * by the engine's `computeDescriptionProvenance`. The card renders it and
 * nothing else — every chip and leaf label selects its node in the preset tree,
 * exactly as the effective config's chips do.
 */

/** Entries shown before a group collapses. Five is the mockup's number, and it
 *  is the point where the list stops reading as a summary: `config:recommended`
 *  alone contributes twenty-odd sentences, and twenty sentences pushed the
 *  question pills — and every other card — below the fold. */
const COLLAPSE_AFTER = 5;

/**
 * The leaf label: the preset that actually wrote this sentence, which is rarely
 * the extend it arrived through. Clickable for the same reason the chips are —
 * the name is only useful if it takes you to the node.
 *
 * Roadmap 081: this was a 0.7rem muted mono label with a `title`, i.e. a fourth
 * way of naming a preset. It is now the standard token, at the standard size,
 * with the standard hover card — which is also what replaces the `title` it
 * carried ("show it in the preset tree" is the card's own link). An approximate
 * attribution keeps its explanation, but as the shared `≈` mark beside the
 * token rather than as prose glued onto the front of the name.
 */
function LeafLabel({
  node,
  approximate,
  onSelectPreset,
}: {
  node: { nodeId: string; name: string };
  /** 069 PR 1's fallback: the enclosing subtree, not a leaf claim. */
  approximate?: boolean;
  onSelectPreset?: (nodeId: string) => void;
}) {
  return (
    <span className="desc-digest-attr">
      {approximate ? <ApproximateMark name={node.name} /> : null}
      <PresetName
        name={node.name}
        nodeId={node.nodeId}
        onClick={onSelectPreset ? () => onSelectPreset(node.nodeId) : undefined}
      />
    </span>
  );
}

/**
 * The right-hand end of a row: who wrote the sentence, and how sure we are.
 *
 * The two are separable, and must be. `approximate` is rendered by the leaf
 * label as a `≈` prefix, but a row can be approximate and still have no leaf to
 * prefix — the engine's fallback lands on the ROOT node whenever the repo
 * level's own replay disagrees with Renovate, and the defaults/global/inherited
 * layers carry no node at all. Marking only the labelled rows would leave those
 * reading as confidently attributed while the card's caveat promises that every
 * untraceable sentence is marked, so the mark stands alone where it has to.
 */
function EntryAttribution({
  entry,
  onSelectPreset,
}: {
  entry: DigestEntry;
  onSelectPreset?: (nodeId: string) => void;
}) {
  // The root node is the repo's own config, and the tree has no row for it —
  // a leaf label there would offer "show it in the preset tree" and select a
  // node that never renders. The group's own `repo config` chip already says
  // whose sentence this is, so the row simply carries no label.
  const leaf = entry.node?.nodeId === ROOT_NODE_ID ? undefined : entry.node;
  if (leaf) {
    return (
      <LeafLabel node={leaf} approximate={entry.approximate} onSelectPreset={onSelectPreset} />
    );
  }
  return entry.approximate ? <ApproximateMark /> : null;
}

/** One sentence: the layer's dot, the prose, and who wrote it. */
function DigestEntryRow({
  entry,
  dotClass,
  onSelectPreset,
}: {
  entry: DigestEntry;
  dotClass: string;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const duplicate = entry.duplicateOfIndex !== undefined;
  return (
    <li className={`desc-digest-row${duplicate ? " duplicate" : ""}`}>
      <span className={`prov-dot ${dotClass}`} aria-hidden="true" />
      <span className="desc-digest-text">
        <CodeText text={entry.value} />
      </span>
      <EntryAttribution entry={entry} onSelectPreset={onSelectPreset} />
    </li>
  );
}

/** A repo `packageRules` description — prose the user wrote, which until now
 *  had no surface at all in the app. */
function DigestRuleRow({ rule, dotClass }: { rule: DigestRule; dotClass: string }) {
  return (
    <li className="desc-digest-row">
      <span className={`prov-dot ${dotClass}`} aria-hidden="true" />
      <span className="desc-digest-text">
        <CodeText text={rule.values.join(" ")} />
      </span>
      <span className="desc-digest-rule-note">{ruleNoteText(rule)}</span>
    </li>
  );
}

/** The group's sentences, collapsed past {@link COLLAPSE_AFTER}. */
function DigestEntryList({
  group,
  dotClass,
  expanded,
  onExpand,
  onSelectPreset,
}: {
  group: DigestGroup;
  dotClass: string;
  /** Owned by the card, not by this list — see {@link DescriptionDigestCard}. */
  expanded: boolean;
  onExpand: () => void;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const hidden = expanded ? 0 : Math.max(0, group.entries.length - COLLAPSE_AFTER);
  const shown = hidden > 0 ? group.entries.slice(0, COLLAPSE_AFTER) : group.entries;
  return (
    <ul className={`desc-digest-list ${dotClass}`}>
      {shown.map((entry) => (
        <DigestEntryRow
          key={entry.index}
          entry={entry}
          dotClass={dotClass}
          onSelectPreset={onSelectPreset}
        />
      ))}
      {hidden > 0 ? (
        <li className="desc-digest-more">
          <button type="button" className="btn-quiet" onClick={onExpand}>
            {hidden} more — show all
          </button>
        </li>
      ) : null}
    </ul>
  );
}

/** The chip line above a group — the extend as the reader wrote it, plus what
 *  it bought them (or the fact that it bought them nothing). */
function DigestGroupHead({
  group,
  onSelectPreset,
}: {
  group: DigestGroup;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const note = groupContributionText(group);
  return (
    <div className="desc-digest-group-head">
      <ProvenanceChip layer={group.layer} onSelectPreset={onSelectPreset} />
      {group.redundant ? (
        <span className="badge desc-digest-redundant">redundant — already included above</span>
      ) : null}
      {note ? <span className="desc-digest-note">{note}</span> : null}
    </div>
  );
}

function DigestGroupBlock({
  group,
  expanded,
  onExpand,
  onSelectPreset,
}: {
  group: DigestGroup;
  expanded: boolean;
  onExpand: (key: string) => void;
  onSelectPreset?: (nodeId: string) => void;
}) {
  // Same hue the layer wears everywhere else in the app (005/013/054): the dot
  // IS the chip's colour, so the group and its sentences can never disagree
  // about where they came from.
  const dotClass = layerClass(group.layer);
  return (
    <div className="desc-digest-group">
      <DigestGroupHead group={group} onSelectPreset={onSelectPreset} />
      {/* A redundant group's sentences are all repeats — the chip already said
          so, and printing them again is the noise this card exists to remove. */}
      {group.redundant ? null : (
        <DigestEntryList
          group={group}
          dotClass={dotClass}
          expanded={expanded}
          onExpand={() => onExpand(group.key)}
          onSelectPreset={onSelectPreset}
        />
      )}
      {group.rules.length > 0 ? (
        <ul className={`desc-digest-list ${dotClass}`}>
          {group.rules.map((rule) => (
            <DigestRuleRow key={rule.ruleIndex} rule={rule} dotClass={dotClass} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** What the groups above could not say: the array members that are not text,
 *  and the caveat a degraded run carries. */
function DigestFootnotes({ digest }: { digest: DescriptionDigest }) {
  const note = unattributedNoteText(digest);
  return (
    <>
      {note ? <p className="desc-digest-aside">{note}</p> : null}
      {digest.degraded ? <DegradedCaveat /> : null}
    </>
  );
}

export function DescriptionDigestCard({
  result,
  onSelectPreset,
  onShowRawOrder,
}: {
  result: TraceResult;
  /** Selects a node in the Preset Resolution Tree — the same callback the
   *  effective config hands its chips (App's `selectPresetNode`). */
  onSelectPreset?: (nodeId: string) => void;
  /** Roadmap 069 (PR 3): opens the Effective config's `description` row, whose
   *  blame ledger keeps the final array's own order — the fact this card
   *  deliberately trades away by grouping. The link is the way back to it. */
  onShowRawOrder?: () => void;
}) {
  const provenance = useDescriptionProvenance(result);
  // "Show all", per group, owned HERE rather than by the list that renders the
  // button. Provenance for a new run arrives asynchronously, so every re-run
  // has a frame with no digest at all — the groups (and any state living inside
  // them) unmount, and an expansion made before an edit would be lost across
  // every keystroke. This component is the one the parent keeps mounted through
  // that gap. Keyed by `DigestGroup.key`, which is stable across runs BY
  // CONSTRUCTION (`stableLayerKey`) precisely so the state cannot reattach to a
  // different preset when node ids are minted afresh.
  const [expanded, setExpanded] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const expand = useCallback((key: string) => {
    setExpanded((prev) => new Map(prev).set(key, true));
  }, []);
  const digest = useMemo(() => {
    if (!provenance) {
      return null;
    }
    const rules = result.finalConfig?.packageRules;
    return buildDescriptionDigest(provenance, Array.isArray(rules) ? rules : null);
  }, [provenance, result]);

  // No card at all while it is loading, unavailable, or empty: a config with no
  // author prose has nothing to say here, and an empty card would still promise
  // that it does.
  if (!digest) {
    return null;
  }

  return (
    <div className="card desc-digest-card">
      <div className="card-title">
        What this config does
        <span className="desc-digest-count">{descriptionCountText(digest.totals)}</span>
        {/* Only when there IS a `description` row to land on: a digest built
            purely from the repo's own `packageRules` prose has no top-level
            array, so the link would filter the Effective config down to a key
            that isn't there and land on "No keys match". */}
        {onShowRawOrder && hasTopLevelDescriptions(digest) ? (
          <button
            type="button"
            className="btn-quiet desc-digest-raw"
            title="Open the description row in the Effective config — every sentence in Renovate's own array order, with the preset that wrote it"
            onClick={onShowRawOrder}
          >
            show raw order
          </button>
        ) : null}
      </div>
      <div className="desc-digest">
        {digest.groups.map((group) => (
          <DigestGroupBlock
            key={group.key}
            group={group}
            expanded={expanded.get(group.key) ?? false}
            onExpand={expand}
            onSelectPreset={onSelectPreset}
          />
        ))}
      </div>
      <DigestFootnotes digest={digest} />
    </div>
  );
}
