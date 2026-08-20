import { useState } from "react";
import { OptionKey } from "@/components/option-docs";
import type { LedgerOption } from "./ledger";
import { nf } from "@/lib/format";
import { pluralWord } from "./tree-shared";

/**
 * Roadmap 075 (iteration 5b): the "Set options" section — every option key a
 * source's subtree set, and which preset in it had the last word. This is the
 * question the tree could only answer by reading a thousand rows.
 *
 * The keys wear the SAME `OptionKey` the effective config's rows do, so the
 * docs hover card works here exactly as it does there; the setter wears the
 * standard preset token, and clicking it opens that preset's node in the tree.
 */

/** Long lists truncate here — enough to see the shape, short enough to scan. */
const PREVIEW_KEYS = 8;

function LedgerOptionRow({
  option,
  onOpenNode,
}: {
  option: LedgerOption;
  onOpenNode: (nodeId: string) => void;
}) {
  return (
    <li className="ledger-option-row">
      <span className="ledger-option-key">
        <OptionKey name={option.key} flagUnknown={false} />
      </span>
      <span className="ledger-option-value">{option.value}</span>
      <span className="ledger-option-arrow" aria-hidden="true">
        ←
      </span>
      <button
        type="button"
        className="preset-token"
        onClick={() => onOpenNode(option.setterId)}
        title="Show this preset in the resolution tree"
      >
        {option.setterName}
      </button>
      {option.nested ? (
        <span className="pill pill-muted" title="Reached through another preset's extends">
          nested · via extends
        </span>
      ) : null}
      {option.alsoSetBy > 0 ? (
        <span className="ledger-option-note">
          also set by {nf.format(option.alsoSetBy)} earlier {pluralWord(option.alsoSetBy, "preset")}
        </span>
      ) : null}
    </li>
  );
}

export function LedgerOptions({
  options,
  active,
  onOpenNode,
}: {
  options: LedgerOption[];
  /** The mosaic's "sets options" tile is selected. */
  active: boolean;
  onOpenNode: (nodeId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (options.length === 0) {
    return null;
  }
  const shown = showAll ? options : options.slice(0, PREVIEW_KEYS);
  const hidden = options.length - shown.length;
  return (
    <section className={`ledger-section${active ? " active" : ""}`}>
      <h4 className="ledger-section-title">
        Set options
        <span className="ledger-section-hint">
          {" "}
          — {nf.format(options.length)} {pluralWord(options.length, "key")}, with the preset whose
          value survived the merge
        </span>
      </h4>
      <ul className="ledger-option-list">
        {shown.map((option) => (
          <LedgerOptionRow key={option.key} option={option} onOpenNode={onOpenNode} />
        ))}
      </ul>
      {hidden > 0 ? (
        <button type="button" className="btn-quiet" onClick={() => setShowAll(true)}>
          {nf.format(hidden)} more {pluralWord(hidden, "key")} — show all
        </button>
      ) : null}
    </section>
  );
}
