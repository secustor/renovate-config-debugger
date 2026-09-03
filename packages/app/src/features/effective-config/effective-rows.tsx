import type { KeyProvenance, RuleAttribution } from "@renovate-config-debugger/engine";
import type {
  DataTableColumn,
  DataTableGrouping,
  DataTableNoun,
  DataTableRow,
  DataTableView,
} from "@/components/data-table";
import { type DeciderGroup, type DeciderId, deciderHead, winningStep } from "./decider-groups";
import {
  type DescriptionLedger,
  ledgerForRow,
  ledgerPreviewText,
  ledgerWriterText,
} from "./description-ledger";
import { valuePreview } from "@/lib/value-preview";
import { isOverridden } from "@/lib/effective-tally";
import { KeyDetail, NoteCell } from "./KeyRowParts";
import { layerLabel } from "@/lib/provenance-layer";
import { OptionKey } from "@/components/option-docs";
import { plural } from "@/lib/format";
import { rowNote } from "./row-notes";
import { RuleFramingText } from "@/components/rule-framing";

/**
 * Roadmap 092: the effective config's provenance entries, reduced to rows of
 * the app's standard data table (`components/DataTable`). It is the whole of
 * what 082's bespoke bands and toolbar used to draw — the key, the value
 * preview, the note, the cascade an open row reveals — expressed as the shared
 * component's own row model, so the tab gets the gear, the columns, the views
 * and the quick filter instead of hand-rolling a fifth set of them.
 *
 * Nothing here is a new derivation: `decider-groups` still says who decided a
 * key, `row-notes` still writes the note, `description-ledger` still owns the
 * `description` row. What this module adds is the mapping — plus the three
 * cells that are richer than a string (the option key with its docs card, the
 * packageRules framing, the note that carries a glossary entry), which the row
 * model takes as nodes beside the text the filter searches.
 */

/** The one grouping the design gives this table, and its default. */
export const DECIDED_BY = "decided-by";

export const EFFECTIVE_GROUPINGS: readonly DataTableGrouping[] = [
  { id: DECIDED_BY, label: "Decided by" },
];

/**
 * The design's three columns. Value and Note are on; "Decided by" is off,
 * because the grouping already heads every row with the layer that decided it —
 * the column is there for the reader who ungroups the table, and for the one
 * who wants the SPECIFIC preset rather than the group's name.
 */
export const EFFECTIVE_COLUMNS: readonly DataTableColumn[] = [
  { id: "value", label: "Value", defaultOn: true, mono: true, width: "16rem" },
  { id: "note", label: "Note", defaultOn: true, width: "13rem" },
  { id: "decider", label: "Decided by", defaultOn: false, width: "7rem" },
];

/** Roadmap 051's two renderings, as the table's views: the first IS the table,
 *  every other one replaces its body (`DataTable`'s `altView`). The strip's ids
 *  and the union the card holds its state in both come from this one map, and
 *  `isEffectiveView` is how the toolbar's `string` re-enters it. */
const EFFECTIVE_VIEW_LABELS = { keys: "By key", json: "As JSON" } as const;

export type EffectiveView = keyof typeof EFFECTIVE_VIEW_LABELS;

export const EFFECTIVE_VIEWS: readonly DataTableView[] = Object.entries(EFFECTIVE_VIEW_LABELS).map(
  ([id, label]) => ({ id, label }),
);

export function isEffectiveView(id: string): id is EffectiveView {
  return Object.hasOwn(EFFECTIVE_VIEW_LABELS, id);
}

export const EFFECTIVE_NOUN: DataTableNoun = { one: "option", many: "options" };

/** Everything a row needs that is not the entry itself — one object rather than
 *  four arguments threaded through the mapping. */
export interface EffectiveRowContext {
  /** Only meaningful for the `packageRules` row. */
  ruleAttribution: RuleAttribution[] | null | undefined;
  /** Roadmap 069: only for the `description` row; null when unavailable. */
  ledger: DescriptionLedger | null;
  /** The name the presets group is headed with (082 GAP-3). */
  presetName: string | null;
  onSelectPreset?: (nodeId: string) => void;
}

/** What the collapsed value cell says: the rule count for `packageRules`, the
 *  sentence count for `description` (069), and one line standing in for
 *  everything else. */
function valueText(
  entry: KeyProvenance,
  rules: unknown[] | null,
  ledger: DescriptionLedger | null,
): string {
  if (rules) {
    return plural(rules.length, "rule");
  }
  return ledger ? ledgerPreviewText(ledger) : valuePreview(entry.finalValue);
}

function effectiveRow(
  entry: KeyProvenance,
  id: DeciderId,
  context: EffectiveRowContext,
): DataTableRow {
  const rules =
    entry.key === "packageRules" && Array.isArray(entry.finalValue) ? entry.finalValue : null;
  const ruleAttribution = entry.key === "packageRules" ? context.ruleAttribution : undefined;
  const ledger = ledgerForRow(entry, context.ledger) ?? null;
  const note = rowNote(entry, ledger ? ledgerWriterText(ledger) : null);
  const head = deciderHead(id, context.presetName);
  const winner = winningStep(entry);
  return {
    key: entry.key,
    lead: entry.key,
    leadNode: <OptionKey name={entry.key} flagUnknown />,
    cells: {
      value: valueText(entry, rules, ledger),
      note: note?.text ?? "",
      decider: winner ? layerLabel(winner.layer) : "default",
    },
    cellNodes: {
      value: rules ? <RuleFramingText total={rules.length} attribution={ruleAttribution} /> : null,
      note: note ? <NoteCell note={note} /> : null,
    },
    groups: { [DECIDED_BY]: { title: head.title, pills: [head.pill], plainTitle: true } },
    qf: isOverridden(entry),
    fields: [],
    // Every group's rows open onto the same body, the defaults included: their
    // one-step chain draws the standard step card ("defaults to", value in
    // full), where a bespoke fields entry used to print a plain snippet.
    detail: (
      <KeyDetail
        entry={entry}
        rules={rules}
        ruleAttribution={ruleAttribution}
        ledger={ledger}
        onSelectPreset={context.onSelectPreset}
      />
    ),
  };
}

/**
 * The rows, in the decided-by order `groupByDecider` produced — the table
 * groups by FIRST APPEARANCE, so handing it the groups' rows in that order is
 * what puts "Your repo config" above the presets above the defaults.
 */
export function effectiveTableRows(
  groups: readonly DeciderGroup[],
  context: EffectiveRowContext,
): DataTableRow[] {
  return groups.flatMap((group) =>
    group.entries.map((entry) => effectiveRow(entry, group.id, context)),
  );
}
