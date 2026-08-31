import { type ReactNode, useState } from "react";
import { nf } from "@/lib/format";
import { useSyncedReset } from "@/hooks/use-synced-reset";
import { useToggleSet } from "@/hooks/use-toggle-set";
import {
  activeColumns,
  activeView,
  type DataTableColumn,
  type DataTableCopy,
  type DataTableGroup,
  type DataTableGroupPill,
  type DataTableGrouping,
  type DataTableNoun,
  type DataTableRow as RowModel,
  type DataTableView,
  defaultVisibleColumns,
  filterDataRows,
  groupDataRows,
  groupPillClass,
  isTableView,
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
 * text, the view, the quick filter, the grouping, which columns are on, which
 * rows are open — is held here by default, because none of it is anybody
 * else's business and none of it survives a reload.
 *
 * Three of those are OPTIONALLY controllable (`view`, `quickFilterOn`,
 * `query`), because a consumer can have state of its own that the reader's
 * choice has to answer to: a table whose rows are a run's output resets its
 * view when a new run lands, and a cross-tab link arrives asking for one
 * particular query. Passing neither the value nor its handler keeps the
 * self-owned behaviour, which is what every consumer that has no such state
 * should do. `openKeys` is the same idea one step weaker — an assignment
 * applied when its identity changes, after which the reader's own carets win
 * again.
 */

/**
 * A value the consumer may own but usually does not. The controlled value
 * wins whenever it is given; the setter always reports, so a consumer can
 * observe without taking over.
 */
function useOptionallyControlled<T>(
  value: T | undefined,
  onChange: ((next: T) => void) | undefined,
  initial: T,
): [T, (next: T) => void] {
  const [own, setOwn] = useState(initial);
  function set(next: T) {
    if (value === undefined) {
      setOwn(next);
    }
    onChange?.(next);
  }
  return [value ?? own, set];
}

/** The column header. It opens with an empty slot exactly the width of a row's
 *  caret, so the header and the rows below it start on the same edge and every
 *  cell lines up with the label above it — the metrics themselves are one set
 *  of custom properties in `18-data-table.css`, shared by both, so they cannot
 *  drift apart again. */
function DataTableHead({
  leadLabel,
  columns,
}: {
  leadLabel: string;
  columns: readonly DataTableColumn[];
}) {
  return (
    <div className="data-table-head">
      <span className="data-table-head-caret" aria-hidden="true" />
      <span className="data-table-head-lead">{leadLabel}</span>
      {columns.map((column) => (
        <span key={column.id} className="data-table-head-cell" style={{ flexBasis: column.width }}>
          {column.label}
        </span>
      ))}
    </div>
  );
}

/** The pills a group's rows contributed, each in one of the app's own tones —
 *  never a color of this table's (`groupPillClass`). */
function DataTableGroupPills({ pills }: { pills: readonly DataTableGroupPill[] }) {
  return (
    <span className="data-table-group-pills">
      {pills.map((pill) => (
        <span key={pill.label} className={groupPillClass(pill)}>
          {pill.label}
        </span>
      ))}
    </span>
  );
}

/** The group header the design draws: the title — mono by default, because the
 *  first grouping titles were file paths, and plain when the row says so — the
 *  pills its rows contributed, and the count. */
function DataTableGroupHead({
  group,
  rowNoun,
}: {
  group: DataTableGroup & { title: string };
  rowNoun: DataTableNoun;
}) {
  return (
    <div className="data-table-group-head">
      <span
        className={group.plainTitle ? "data-table-group-title plain" : "data-table-group-title"}
      >
        {group.title}
      </span>
      <DataTableGroupPills pills={group.pills} />
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

/** The table proper — everything the alternate view replaces. */
function DataTableBody({
  groups,
  columns,
  leadLabel,
  rowNoun,
  query,
  isOpen,
  onToggleRow,
}: {
  groups: readonly DataTableGroup[];
  columns: readonly DataTableColumn[];
  leadLabel: string;
  rowNoun: DataTableNoun;
  query: string;
  isOpen: (key: string) => boolean;
  onToggleRow: (key: string) => void;
}) {
  const matches = groups.reduce((total, group) => total + group.rows.length, 0);
  return (
    <>
      <DataTableHead leadLabel={leadLabel} columns={columns} />
      {matches === 0 ? (
        <p className="data-table-none">Nothing matches “{query}”.</p>
      ) : (
        groups.map((group) => (
          <DataTableGroupBlock
            key={group.title ?? ""}
            group={group}
            columns={columns}
            rowNoun={rowNoun}
            isOpen={isOpen}
            onToggleRow={onToggleRow}
          />
        ))
      )}
    </>
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
  copy,
  views = [],
  view,
  onViewChange,
  altView,
  filtersInertTitle,
  quickFilterLabel,
  quickFilterOn,
  onQuickFilter,
  query,
  onQuery,
  openKeys,
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
  /** The toolbar's copy button, left of the gear; `null` = slot reserved, no
   *  payload yet, nothing drawn. */
  copy?: DataTableCopy | null;
  /** Empty = one rendering and no View section. The FIRST view is the table;
   *  any other one draws {@link altView} in its place. */
  views?: readonly DataTableView[];
  /** Controlled active view; omit for the table's own. */
  view?: string;
  onViewChange?: (id: string) => void;
  /** What replaces the table body while a non-first view is active. */
  altView?: ReactNode;
  /** Why the filters are disabled while an alternate view is up — the title on
   *  the inert controls. */
  filtersInertTitle?: string;
  /** Present = a Filter section with this checkbox; absent = no such section. */
  quickFilterLabel?: string;
  /** Controlled quick-filter state; omit for the table's own. */
  quickFilterOn?: boolean;
  onQuickFilter?: (on: boolean) => void;
  /** Controlled filter text; omit for the table's own. */
  query?: string;
  onQuery?: (value: string) => void;
  /**
   * Which rows the CONSUMER wants open. Not a controlled value — the reader
   * takes over the moment they click a caret — but an assignment applied
   * whenever this set's IDENTITY changes: a cross-tab link landing on one
   * particular record, and a new run closing everything that was open on the
   * last one. A consumer with no such state omits it and the table owns the
   * whole affair.
   */
  openKeys?: ReadonlySet<string>;
}) {
  const [text, setText] = useOptionallyControlled(query, onQuery, "");
  const [viewId, setViewId] = useOptionallyControlled(view, onViewChange, views[0]?.id ?? "");
  const [quick, setQuick] = useOptionallyControlled(quickFilterOn, onQuickFilter, false);
  const [grouping, setGrouping] = useState<string | null>(defaultGroupingId);
  const visibleColumns = useToggleSet(defaultVisibleColumns(columns));
  const openRows = useToggleSet();
  // Starts at `undefined` rather than at the incoming set, so a consumer that
  // mounts this table already asking for a row open — the cross-tab link that
  // switched to the tab — is honoured on the first render instead of adopted
  // as seen. A consumer that passes nothing never fires it.
  useSyncedReset<ReadonlySet<string> | undefined>(
    openKeys,
    () => openRows.reset(openKeys),
    () => undefined,
  );
  const showTable = isTableView(views, viewId);
  // Filtering and grouping rows nobody is looking at is pure waste — while an
  // alternate view is up, the body is not rendered at all.
  const groups = showTable ? groupDataRows(filterDataRows(rows, text, quick), grouping) : [];
  return (
    <div className="data-table">
      <DataTableToolbar
        query={text}
        onQuery={setText}
        filterPlaceholder={filterPlaceholder}
        contextNote={contextNote}
        copy={copy}
        views={views}
        view={activeView(views, viewId)?.id ?? null}
        onView={setViewId}
        quickFilterLabel={quickFilterLabel}
        quickFilterOn={quick}
        onQuickFilter={setQuick}
        filtersInert={!showTable}
        filtersInertTitle={filtersInertTitle}
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
        {showTable ? (
          <DataTableBody
            groups={groups}
            columns={activeColumns(columns, visibleColumns.set)}
            leadLabel={leadLabel}
            rowNoun={rowNoun}
            query={text}
            isOpen={(key) => openRows.set.has(key)}
            onToggleRow={openRows.toggle}
          />
        ) : (
          altView
        )}
      </div>
    </div>
  );
}
