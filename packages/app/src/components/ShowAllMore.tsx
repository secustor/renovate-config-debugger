import { nf, pluralWord } from "@/lib/format";

/**
 * The one closing line of a collapsed list: what the cap is holding back, and
 * the click that lifts it. Three surfaces had spelled the same sentence and the
 * same quiet button independently — the Effective config's bands, the preset
 * ledger's "Set options" list, and the blame ledger's dropped-descriptions
 * footer — so the grammar could drift between two lists on one screen.
 *
 * Renders nothing at all when there is nothing hidden, so callers can hand it
 * the count without guarding first.
 *
 * `noun` names what is being held back and is pluralised against the count
 * (`3 more keys — show all`); without one the line stays the bare `3 more —
 * show all`, which is what a list whose subject its heading already names
 * wants. The cap itself is `COLLAPSE_AFTER` in `lib/collapse.ts`.
 *
 * NOT the Overview's tail toggle: that one is two-way (`show less` swaps back)
 * and deliberately a different control.
 */
export function ShowAllMore({
  hidden,
  noun,
  onShowAll,
}: {
  hidden: number;
  noun?: string;
  onShowAll: () => void;
}) {
  if (hidden <= 0) {
    return null;
  }
  const what = noun ? ` ${pluralWord(hidden, noun)}` : "";
  return (
    <button type="button" className="btn-quiet" onClick={onShowAll}>
      {`${nf.format(hidden)} more${what} — show all`}
    </button>
  );
}
