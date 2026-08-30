import { type RefObject, useId } from "react";
import { ESCAPE_PRIORITY } from "@/lib/escape-stack";
import { useAnchoredPopover } from "@/hooks/use-anchored-popover";
import { type DataTableColumn, type DataTableGrouping, NO_GROUPING } from "./data-table";

/**
 * Roadmap 089 — the standard data table's toolbar: the filter field, the
 * optional context note ("from acme/webapp"), and the gear that opens the
 * display options.
 *
 * The options live in a POPOVER rather than in the toolbar because they are
 * settings, not the reader's task: the design's toolbar row is a search box and
 * a gear, and the grouping and column pills are what the gear reveals. It is
 * the app's one anchored-popover contract (`useAnchoredPopover`), so Escape,
 * the outside click and the focus hand-back behave exactly as they do
 * everywhere else.
 */

/** One section of the popover: a label and a row of pills. Its own component
 *  because two sections is already the point where a copy would drift, and
 *  because the caller's JSX has a depth budget (`react/jsx-max-depth`).
 *
 *  A `<fieldset>`/`<legend>` rather than a `role="group"` with an `aria-label`:
 *  the section IS a set of related controls with a name, which is the element
 *  the platform already has for it (the styling it arrives with is reset in
 *  `18-data-table.css`). */
function DataTableOptionSection({
  label,
  options,
  isOn,
  onPick,
}: {
  label: string;
  options: readonly { id: string; label: string }[];
  isOn: (id: string) => boolean;
  onPick: (id: string) => void;
}) {
  return (
    <fieldset className="data-table-option-section">
      <legend className="data-table-option-label">{label}</legend>
      <div className="data-table-option-pills">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={isOn(option.id) ? "data-table-option on" : "data-table-option"}
            aria-pressed={isOn(option.id)}
            onClick={() => onPick(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function DataTableOptionsPanel({
  panelId,
  panelRef,
  groupings,
  grouping,
  onGrouping,
  columns,
  visible,
  onToggleColumn,
}: {
  panelId: string;
  panelRef: RefObject<HTMLDivElement | null>;
  groupings: readonly DataTableGrouping[];
  grouping: string | null;
  onGrouping: (id: string | null) => void;
  columns: readonly DataTableColumn[];
  visible: ReadonlySet<string>;
  onToggleColumn: (id: string) => void;
}) {
  return (
    <div className="data-table-options-panel" id={panelId} ref={panelRef}>
      {groupings.length === 0 ? null : (
        <DataTableOptionSection
          label="Group by"
          options={[...groupings, { id: NO_GROUPING, label: "None" }]}
          isOn={(id) => (grouping ?? NO_GROUPING) === id}
          onPick={(id) => onGrouping(id === NO_GROUPING ? null : id)}
        />
      )}
      {columns.length === 0 ? null : (
        <DataTableOptionSection
          label="Columns"
          options={columns}
          isOn={(id) => visible.has(id)}
          onPick={onToggleColumn}
        />
      )}
    </div>
  );
}

function DataTableOptions(props: {
  groupings: readonly DataTableGrouping[];
  grouping: string | null;
  onGrouping: (id: string | null) => void;
  columns: readonly DataTableColumn[];
  visible: ReadonlySet<string>;
  onToggleColumn: (id: string) => void;
}) {
  const { open, triggerRef, panelRef, toggle } = useAnchoredPopover(ESCAPE_PRIORITY.popover);
  const panelId = useId();
  return (
    <span className="data-table-options">
      <button
        type="button"
        ref={triggerRef}
        className="data-table-gear"
        aria-label="Display options"
        title="Display options"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      >
        ⚙
      </button>
      {open ? <DataTableOptionsPanel panelId={panelId} panelRef={panelRef} {...props} /> : null}
    </span>
  );
}

export function DataTableToolbar({
  query,
  onQuery,
  filterPlaceholder,
  contextNote,
  groupings,
  grouping,
  onGrouping,
  columns,
  visible,
  onToggleColumn,
}: {
  query: string;
  onQuery: (value: string) => void;
  /** Doubles as the field's accessible name — it states the totals, which is
   *  the only place they appear once the list is grouped. */
  filterPlaceholder: string;
  /** Where these rows came from; absent = nothing to say. */
  contextNote?: string;
  groupings: readonly DataTableGrouping[];
  grouping: string | null;
  onGrouping: (id: string | null) => void;
  columns: readonly DataTableColumn[];
  visible: ReadonlySet<string>;
  onToggleColumn: (id: string) => void;
}) {
  return (
    <div className="data-table-toolbar">
      <input
        className="data-table-filter"
        aria-label={filterPlaceholder}
        placeholder={filterPlaceholder}
        value={query}
        onChange={(event) => onQuery(event.target.value)}
      />
      {contextNote === undefined ? null : <span className="data-table-context">{contextNote}</span>}
      <DataTableOptions
        groupings={groupings}
        grouping={grouping}
        onGrouping={onGrouping}
        columns={columns}
        visible={visible}
        onToggleColumn={onToggleColumn}
      />
    </div>
  );
}
