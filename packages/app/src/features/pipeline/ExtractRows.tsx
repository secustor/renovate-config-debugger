import type { ReactNode } from "react";
import { Caret } from "@/components/Caret";
import type { RepoDep } from "@/types/repo";

/**
 * Roadmap 090 — the parts the Extract phase's three cards are built from: a
 * disclosure row, a dependency list, and the muted notes under a card.
 *
 * One row implementation rather than three near-identical ones: the cards
 * differ in what a row LEADS with (a manager, a file, a manager again) and in
 * what it opens onto, not in how a row behaves. The lead is a `<code>` in all
 * three because all three are identifiers Renovate itself would print.
 */

export function ExtractRow({
  lead,
  count,
  note,
  open,
  onToggle,
  children,
}: {
  lead: string;
  /** The row's own number — "4 files", "6 deps". */
  count: string;
  /** The muted line the collapsed row previews its contents with. */
  note?: string;
  open: boolean;
  onToggle: () => void;
  /** What the row opens onto; rendered only while open. */
  children: ReactNode;
}) {
  return (
    <li className={open ? "extract-row open" : "extract-row"}>
      <button type="button" className="extract-row-head" aria-expanded={open} onClick={onToggle}>
        <Caret open={open} />
        <code className="extract-row-lead">{lead}</code>
        <span className="extract-row-count">{count}</span>
        <span className="extract-row-note">{note ?? ""}</span>
      </button>
      {open ? children : null}
    </li>
  );
}

/** The dependencies an open row lists: the name, what the file says it is at,
 *  and one trailing fact the card chooses (the manager, or the file). */
export function ExtractDepList({
  deps,
  trailing,
}: {
  deps: readonly RepoDep[];
  trailing: (dep: RepoDep) => string;
}) {
  return (
    <ul className="extract-sublist">
      {deps.map((dep) => (
        <li key={dep.key} className="extract-subrow">
          <code className="extract-subrow-lead">{dep.depName}</code>
          <span className="extract-subrow-value">{dep.value === "" ? "—" : dep.value}</span>
          <span className="extract-subrow-trail">{trailing(dep)}</span>
        </li>
      ))}
    </ul>
  );
}

/** The small print under a card: what the walk did not do. */
export function ExtractNotes({ notes }: { notes: readonly string[] }) {
  return (
    <p className="extract-notes">
      {notes.map((note) => (
        <span key={note} className="extract-note-line">
          {note}
        </span>
      ))}
    </p>
  );
}
