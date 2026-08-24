import type { ReactNode } from "react";
import { OptionKey } from "@/components/option-docs";
import { previewValue } from "./rule-format";

/**
 * Roadmap 054 layer 7: THE row for "something wrote this key". Four surfaces
 * used to say the same `key: before → after` sentence in four dialects — the
 * matched-rule drawer's list, the (since-retired) A/B config delta, the
 * evidence popover's digest, and a thread's struck-through override line —
 * each with its own markup, its own value classes, and its own idea of
 * whether the key deserved the option-docs hover card (only two of the four
 * gave it one).
 *
 * One component, one grammar: `mark · key · before → after · note`, on shared
 * grid columns (`.kv.sim-writes`) so a column of writes reads straight down its
 * value edge. The mark, the strike and the note are the only knobs, because
 * they are the only things the four surfaces actually disagreed about.
 */

/**
 * One side of a write. A JSON value the row previews itself, or a literal the
 * caller already has words for — `(unset)`, `removed` — which must NOT be
 * JSON-quoted into a value that looks like a string the config carries.
 */
type WriteValue = { json: unknown } | { text: string };

function valueText(value: WriteValue, max: number): string {
  return "text" in value ? value.text : previewValue(value.json, max);
}

export function WriteRow({
  name,
  before,
  after,
  mark,
  struck = false,
  note,
  max = 60,
}: {
  /** The config key this row is about; carries the option-docs hover card.
   *  (`key` is React's own prop, hence `name` — the callers still key rows on
   *  the config key itself.) */
  name: string;
  /** The value the key held going in; omitted when it had none. */
  before?: WriteValue;
  /** What this write left behind; omitted when the row states a value that was
   *  taken away rather than one that landed (a thread's override line). */
  after?: WriteValue;
  /** Leading glyph — `~`/`+`/`−` for what a write did, `⊘` for a value that
   *  lost. Absent leaves the column empty, keeping the rows aligned. */
  mark?: string;
  /** Struck `after`: this write happened here, but a later stop took it away. */
  struck?: boolean;
  /** Trailing aside — who wrote the lost value, which step overrode it. */
  note?: ReactNode;
  /** Value truncation, per surface. */
  max?: number;
}) {
  return (
    // `sim-write-row` styles nothing — `.kv-row` does that. It is how the e2e
    // suite and this row's own test address a write line.
    <div className="kv-row sim-write-row">
      <span className="sim-write-mark">{mark ?? ""}</span>
      <span className="sim-write-key">
        <OptionKey name={name} flagUnknown />
      </span>
      <span className="sim-write-values">
        {before ? <span className="sim-merged-before">{valueText(before, max)}</span> : null}
        {before && after ? " → " : null}
        {after ? (
          <span className={`sim-merged-after${struck ? " overridden" : ""}`}>
            {valueText(after, max)}
          </span>
        ) : null}
        {note ? <span className="sim-write-note"> {note}</span> : null}
      </span>
    </div>
  );
}
