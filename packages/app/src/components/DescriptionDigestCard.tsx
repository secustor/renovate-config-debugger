import { useMemo, useState } from "react";
import type { TraceResult } from "@renovate-config-debugger/engine";
import {
  buildDescriptionDigest,
  descriptionCountText,
  type DigestEntry,
  type DigestGroup,
  type DigestRule,
  groupContributionText,
  ruleNoteText,
} from "@/lib/description-digest";
import { useDescriptionProvenance } from "@/hooks/description-provenance";
import { CodeText } from "./CodeText";
import { ProvenanceChip } from "./ProvenanceChip";
import { layerClass } from "./provenance-layer";

/**
 * Roadmap 069 (PR 2): "What this config does" — the Overview's second card, and
 * the flagship surface of the description feature.
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

/** The mono leaf label: the preset that actually wrote this sentence, which is
 *  rarely the extend it arrived through. Clickable for the same reason the
 *  chips are — the name is only useful if it takes you to the node. */
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
  const label = approximate ? `≈ ${node.name}` : node.name;
  const title = approximate
    ? `Contributed somewhere inside ${node.name} — the exact preset could not be determined`
    : `Written by ${node.name} — show it in the preset tree`;
  if (!onSelectPreset) {
    return (
      <span className="desc-digest-leaf" title={title}>
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="desc-digest-leaf"
      title={title}
      onClick={() => onSelectPreset(node.nodeId)}
    >
      {label}
    </button>
  );
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
      {entry.node ? (
        <LeafLabel
          node={entry.node}
          approximate={entry.approximate}
          onSelectPreset={onSelectPreset}
        />
      ) : null}
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
  onSelectPreset,
}: {
  group: DigestGroup;
  dotClass: string;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
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
          <button type="button" className="linklike" onClick={() => setExpanded(true)}>
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
  onSelectPreset,
}: {
  group: DigestGroup;
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
        <DigestEntryList group={group} dotClass={dotClass} onSelectPreset={onSelectPreset} />
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

export function DescriptionDigestCard({
  result,
  onSelectPreset,
}: {
  result: TraceResult;
  /** Selects a node in the Preset Resolution Tree — the same callback the
   *  effective config hands its chips (App's `selectPresetNode`). */
  onSelectPreset?: (nodeId: string) => void;
}) {
  const provenance = useDescriptionProvenance(result);
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
      </div>
      <div className="desc-digest">
        {digest.groups.map((group) => (
          <DigestGroupBlock key={group.key} group={group} onSelectPreset={onSelectPreset} />
        ))}
      </div>
      {digest.degraded ? (
        <p className="desc-digest-caveat">
          Some sentences could not be traced to the exact preset that wrote them — those are marked
          with the enclosing preset and a <code>≈</code>. The wording and the order are still
          Renovate’s own.
        </p>
      ) : null}
    </div>
  );
}
