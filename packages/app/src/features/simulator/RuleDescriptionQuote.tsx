import { CodeText } from "@/components/CodeText";
import type { RuleDescriptionNote } from "./rule-descriptions";

/**
 * Roadmap 069 (PR 5): a matched rule's own description, quoted where the rule
 * is shown — the left-bordered quote of the 069 mockup, then a muted line
 * naming whose words they are.
 *
 * Only for rules that HAVE one, and only on rows that MATCHED: on a no-match
 * row the sentence explains a rule that did nothing, which is noise in a list
 * the reader is scanning for the one that did.
 */
export function RuleDescriptionQuote({ note }: { note: RuleDescriptionNote }) {
  return (
    <div className="sim-rule-why">
      {note.values.map((value, i) => (
        // Roadmap 041 — index key, deliberately: these are the strings of ONE
        // immutable rule body in their own order, they can legally repeat, and
        // nothing ever inserts into or reorders the list.
        // oxlint-disable-next-line react/no-array-index-key -- see above
        <p key={i} className="sim-rule-why-line">
          <CodeText text={value} />
        </p>
      ))}
      <p className="sim-rule-why-attr">— {note.attribution}</p>
    </div>
  );
}
