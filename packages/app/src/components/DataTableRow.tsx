import { Caret } from "@/components/Caret";
import { OptionKey } from "@/components/option-docs";
import type {
  DataTableAction,
  DataTableColumn,
  DataTableField,
  DataTableRow as RowModel,
} from "./data-table";

/**
 * Roadmap 089 — one row of the standard data table, and what it opens into.
 *
 * The row is a disclosure BUTTON carrying the lead and the active cells, with
 * the action buttons as its siblings rather than its children: nesting a
 * "Pin as test" button inside the row button would be invalid markup and would
 * make every action click also toggle the row.
 */

function DataTableCell({ column, value }: { column: DataTableColumn; value: string }) {
  const empty = value === "";
  return (
    <span
      className={`data-table-cell${column.mono ? " mono" : ""}${empty ? " empty" : ""}`}
      title={empty ? undefined : value}
    >
      {empty ? "—" : value}
    </span>
  );
}

function DataTableRowField({ field }: { field: DataTableField }) {
  return (
    <>
      {/* The standard option key — a label the docs index knows gets its hover
          card; any other renders as a plain span. */}
      <dt>
        <OptionKey name={field.label} flagUnknown={false} />
      </dt>
      <dd>{field.value}</dd>
    </>
  );
}

/** The expanded body: every field the row's source actually carries. The
 *  builder omits the empty ones — a definition list of blanks says nothing. */
function DataTableRowBody({ fields }: { fields: readonly DataTableField[] }) {
  return (
    <dl className="data-table-fields">
      {fields.map((field) => (
        <DataTableRowField key={field.label} field={field} />
      ))}
    </dl>
  );
}

function DataTableActions({ actions }: { actions: readonly DataTableAction[] }) {
  return (
    <span className="data-table-row-actions">
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className="data-table-action"
          title={action.title}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ))}
    </span>
  );
}

function DataTableRowHead({
  row,
  columns,
  open,
  onToggle,
}: {
  row: RowModel;
  columns: readonly DataTableColumn[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="data-table-row-head" aria-expanded={open} onClick={onToggle}>
      <Caret open={open} />
      <code className="data-table-lead">{row.lead}</code>
      {row.badge === undefined ? null : (
        <span className="data-table-badge" title={row.badge.title}>
          {row.badge.text}
        </span>
      )}
      {columns.map((column) => (
        <DataTableCell key={column.id} column={column} value={row.cells[column.id] ?? ""} />
      ))}
    </button>
  );
}

export function DataTableRow({
  row,
  columns,
  open,
  onToggle,
}: {
  row: RowModel;
  /** The columns currently switched on, in declaration order. */
  columns: readonly DataTableColumn[];
  open: boolean;
  onToggle: () => void;
}) {
  const actions = row.actions ?? [];
  return (
    <div className={open ? "data-table-row open" : "data-table-row"}>
      <DataTableRowHead row={row} columns={columns} open={open} onToggle={onToggle} />
      {actions.length === 0 ? null : <DataTableActions actions={actions} />}
      {open ? <DataTableRowBody fields={row.fields} /> : null}
    </div>
  );
}
