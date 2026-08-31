import { useState } from "react";
import { nf } from "@/lib/format";
import { useToggleSet } from "@/hooks/use-toggle-set";
import {
  activeColumns,
  type DataTableColumn,
  type DataTableGroup,
  type DataTableGrouping,
  type DataTableNoun,
  type DataTableRow as RowModel,
  defaultVisibleColumns,
  filterDataRows,
  groupDataRows,
} from "./data-table";
import { DataTableRow } from "./DataTableRow";
import { DataTableToolbar } from "./DataTableToolbar";

/**
 * Roadmap 089 — the app's standard data table (Claude Design artboard
 * `Data Table.dc.html`): a filter row with display options, an optional
 * grouping, toggleable columns, and rows that open into the full record.
 *
 * It is a SHARED component and knows nothing about what it lists: a consumer
 * hands it rows already reduced to cells, group titles and fields
 * (`data-table.ts`), which is what lets it live in `components/` while its
 * first consumer is a feature. Everything the reader can change — the filter
 * text, the grouping, which columns are on, which rows are open — is held
 * here, because none of it is anybody else's business and none of it survives
 * a reload.
 */

function DataTableHead({
  leadLabel,
  columns,
}: {
  leadLabel: string;
  columns: readonly DataTableColumn[];
}) {
  return (
    <div className="data-table-head">
      <span className="data-table-head-lead">{leadLabel}</span>
      {columns.map((column) => (
        <span key={column.id} className="data-table-head-cell">
          {column.label}
        </span>
      ))}
    </div>
  );
}

/** The group header the design draws: the title, the pills its rows
 *  contributed (the managers that read a package file), and the count. */
function DataTableGroupHead({
  group,
  rowNoun,
}: {
  group: DataTableGroup & { title: string };
  rowNoun: DataTableNoun;
}) {
  return (
    <div className="data-table-group-head">
      <span className="data-table-group-title">{group.title}</span>
      <span className="data-table-group-pills">
        {group.pills.map((pill) => (
          <span key={pill} className="pill pill-muted">
            {pill}
          </span>
        ))}
      </span>
      <span className="data-table-group-count">
        {nf.format(group.rows.length)} {group.rows.length === 1 ? rowNoun.one : rowNoun.many}
      </span>
    </div>
  );
}

function DataTableGroupBlock({
  group,
  columns,
  rowNoun,
  isOpen,
  onToggleRow,
}: {
  group: DataTableGroup;
  columns: readonly DataTableColumn[];
  rowNoun: DataTableNoun;
  isOpen: (key: string) => boolean;
  onToggleRow: (key: string) => void;
}) {
  return (
    <div className="data-table-group">
      {group.title === null ? null : (
        <DataTableGroupHead group={{ ...group, title: group.title }} rowNoun={rowNoun} />
      )}
      {group.rows.map((row) => (
        <DataTableRow
          key={row.key}
          row={row}
          columns={columns}
          open={isOpen(row.key)}
          onToggle={() => onToggleRow(row.key)}
        />
      ))}
    </div>
  );
}

export function DataTable({
  rows,
  columns,
  groupings,
  defaultGroupingId = null,
  leadLabel,
  rowNoun,
  filterPlaceholder,
  contextNote,
}: {
  rows: readonly RowModel[];
  columns: readonly DataTableColumn[];
  /** Empty = no Group by section at all (a table with one natural order). */
  groupings: readonly DataTableGrouping[];
  /** null = open ungrouped. */
  defaultGroupingId?: string | null;
  /** The header above the lead column. */
  leadLabel: string;
  /** What the group headers count ("32 dependencies"). */
  rowNoun: DataTableNoun;
  filterPlaceholder: string;
  contextNote?: string;
}) {
  const [query, setQuery] = useState("");
  const [grouping, setGrouping] = useState<string | null>(defaultGroupingId);
  const visibleColumns = useToggleSet(defaultVisibleColumns(columns));
  const openRows = useToggleSet();
  const shown = activeColumns(columns, visibleColumns.set);
  const groups = groupDataRows(filterDataRows(rows, query), grouping);
  const matches = groups.reduce((total, group) => total + group.rows.length, 0);
  return (
    <div className="data-table">
      <DataTableToolbar
        query={query}
        onQuery={setQuery}
        filterPlaceholder={filterPlaceholder}
        contextNote={contextNote}
        groupings={groupings}
        grouping={grouping}
        onGrouping={setGrouping}
        columns={columns}
        visible={visibleColumns.set}
        onToggleColumn={visibleColumns.toggle}
      />
      {/* The corner clip lives HERE, not on `.data-table`: the gear's popover
          hangs off the toolbar, and a root-level `overflow: hidden` cut it off
          at a short table's bottom edge. */}
      <div className="data-table-body">
        <DataTableHead leadLabel={leadLabel} columns={shown} />
        {matches === 0 ? (
          <p className="data-table-none">Nothing matches “{query}”.</p>
        ) : (
          groups.map((group) => (
            <DataTableGroupBlock
              key={group.title ?? ""}
              group={group}
              columns={shown}
              rowNoun={rowNoun}
              isOpen={(key) => openRows.set.has(key)}
              onToggleRow={openRows.toggle}
            />
          ))
        )}
      </div>
    </div>
  );
}
