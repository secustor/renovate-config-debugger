import { memo, type ReactNode } from "react";
import { Caret } from "@/components/Caret";
import { OptionKey } from "@/components/option-docs";
import { Term } from "@/components/glossary";
import type {
  DataTableAction,
  DataTableColumn,
  DataTableField,
  DataTableRow as RowModel,
} from "./data-table";

/**
 * Roadmap 089 — one row of the standard data table, and what it opens into.
 *
 * The row is a full-width disclosure BUTTON carrying the lead and the active
 * cells, and everything else the row has is what OPENING it reveals, in the
 * design's order: the prepared `detail` block (a record with more to say than
 * key/value lines), the fields, then the actions.
 *
 * The actions live in the open row rather than beside every collapsed one for
 * two reasons: a list of two hundred rows each wearing two buttons is a wall of
 * chrome nobody asked for, and a row that ends in buttons is a row whose cells
 * stop short of the header's columns. They are still SIBLINGS of the head
 * button, never its children — nesting a "Pin as test" button inside the
 * disclosure would be invalid markup and would make every action click a row
 * toggle too — and each opened part is a full-width line of the row's flex box.
 */

/** One cell: the column's width, the row's text — or, when the row prepared
 *  one, the node it wants drawn there instead. The text still fills the
 *  `title`, so a rich cell the column is too narrow for is readable the same
 *  way a plain one is.
 *
 *  A row that declares a cell node CONDITIONALLY hands over `null` for the rows
 *  that get none (`note ? <NoteCell/> : null`), so "no node" has to mean null
 *  as well as undefined — otherwise those rows lose the "—" and the `empty`
 *  class that a consumer declaring no nodes at all still gets. */
function DataTableCell({
  column,
  value,
  node,
}: {
  column: DataTableColumn;
  value: string;
  node: ReactNode;
}) {
  const content = node ?? null;
  const empty = value === "" && content === null;
  return (
    <span
      className={`data-table-cell${column.mono ? " mono" : ""}${empty ? " empty" : ""}`}
      title={value === "" ? undefined : value}
      style={{ flexBasis: column.width }}
    >
      {content ?? (empty ? "—" : value)}
    </span>
  );
}

function DataTableRowField({ field }: { field: DataTableField }) {
  return (
    <>
      {/* Every label explains itself on hover: its glossary entry when the
          field declared one, else the option-docs card when the docs index
          knows the name, else a plain span. */}
      <dt>
        {field.term === undefined ? (
          <OptionKey name={field.label} flagUnknown={false} />
        ) : (
          <Term id={field.term}>{field.label}</Term>
        )}
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
          className="btn-chip data-table-action"
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
  onToggle: (key: string) => void;
}) {
  return (
    <button
      type="button"
      className="data-table-row-head"
      aria-expanded={open}
      onClick={() => onToggle(row.key)}
    >
      <Caret open={open} />
      <code className="data-table-lead">{row.leadNode ?? row.lead}</code>
      {row.badge === undefined ? null : (
        <span className="pill pill-warn data-table-badge" title={row.badge.title}>
          {row.badge.text}
        </span>
      )}
      {columns.map((column) => (
        <DataTableCell
          key={column.id}
          column={column}
          value={row.cells[column.id] ?? ""}
          node={row.cellNodes?.[column.id]}
        />
      ))}
    </button>
  );
}

/** Memoized: one caret toggle re-renders the table, and a two-hundred-row list
 *  must not rebuild the 199 rows that did not change. The table keeps `row`,
 *  `columns` and `onToggle` identity-stable for exactly this reason — the
 *  handler takes the KEY rather than closing over the row. */
export const DataTableRow = memo(function DataTableRow({
  row,
  columns,
  open,
  onToggle,
}: {
  row: RowModel;
  /** The columns currently switched on, in declaration order. */
  columns: readonly DataTableColumn[];
  open: boolean;
  onToggle: (key: string) => void;
}) {
  const actions = row.actions ?? [];
  return (
    <div className={open ? "data-table-row open" : "data-table-row"}>
      <DataTableRowHead row={row} columns={columns} open={open} onToggle={onToggle} />
      {open && row.detail !== undefined ? (
        <div className="data-table-row-detail">{row.detail}</div>
      ) : null}
      {open && row.fields.length > 0 ? <DataTableRowBody fields={row.fields} /> : null}
      {open && actions.length > 0 ? <DataTableActions actions={actions} /> : null}
    </div>
  );
});
