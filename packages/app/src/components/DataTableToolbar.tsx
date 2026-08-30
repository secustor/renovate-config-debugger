import { type RefObject, useId } from "react";
import { ESCAPE_PRIORITY } from "@/lib/escape-stack";
import { useAnchoredPopover } from "@/hooks/use-anchored-popover";
import { CopyButton } from "@/components/CopyButton";
import {
  type DataTableColumn,
  type DataTableCopy,
  type DataTableGrouping,
  type DataTableView,
  NO_GROUPING,
} from "./data-table";

/**
 * Roadmap 089 — the standard data table's toolbar: the filter field, the
 * optional context note ("from acme/webapp"), an optional copy button, and the
 * gear that opens the display options.
 *
 * The options live in a POPOVER rather than in the toolbar because they are
 * settings, not the reader's task: the design's toolbar row is a search box and
 * a gear, and the view, quick filter, grouping and column pills are what the
 * gear reveals. It is the app's one anchored-popover contract
 * (`useAnchoredPopover`), so Escape, the outside click and the focus hand-back
 * behave exactly as they do everywhere else.
 *
 * The popover's sections read in the order the design fixes: **View** (what am
 * I looking at), **Filter** (which rows), **Group by**, **Columns**. Each is
 * absent unless the consumer asked for it — a table with one rendering shows no
 * View section rather than a picker with a single pill in it.
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

/** The quick filter: a checkbox, not a pill, because it is not one of a set —
 *  it is one claim about the rows that is either being made or not. Inert while
 *  an alternate view is on screen: the alternate view is a whole document, and
 *  narrowing rows says nothing about it. */
function DataTableQuickFilter({
  label,
  on,
  onChange,
  inert,
  inertTitle,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
  inert: boolean;
  inertTitle?: string;
}) {
  return (
    <fieldset className="data-table-option-section">
      <legend className="data-table-option-label">Filter</legend>
      <label className="data-table-quick-filter" title={inert ? inertTitle : undefined}>
        <input
          type="checkbox"
          checked={on}
          disabled={inert}
          onChange={(event) => onChange(event.target.checked)}
        />
        {label}
      </label>
    </fieldset>
  );
}

interface OptionsProps {
  views: readonly DataTableView[];
  view: string | null;
  onView: (id: string) => void;
  quickFilterLabel?: string;
  quickFilterOn: boolean;
  onQuickFilter: (on: boolean) => void;
  filtersInert: boolean;
  filtersInertTitle?: string;
  groupings: readonly DataTableGrouping[];
  grouping: string | null;
  onGrouping: (id: string | null) => void;
  columns: readonly DataTableColumn[];
  visible: ReadonlySet<string>;
  onToggleColumn: (id: string) => void;
}

function DataTableOptionsPanel({
  panelId,
  panelRef,
  views,
  view,
  onView,
  quickFilterLabel,
  quickFilterOn,
  onQuickFilter,
  filtersInert,
  filtersInertTitle,
  groupings,
  grouping,
  onGrouping,
  columns,
  visible,
  onToggleColumn,
}: OptionsProps & { panelId: string; panelRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div className="data-table-options-panel" id={panelId} ref={panelRef}>
      {views.length === 0 ? null : (
        <DataTableOptionSection
          label="View"
          options={views}
          isOn={(id) => id === view}
          onPick={onView}
        />
      )}
      {quickFilterLabel === undefined ? null : (
        <DataTableQuickFilter
          label={quickFilterLabel}
          on={quickFilterOn}
          onChange={onQuickFilter}
          inert={filtersInert}
          inertTitle={filtersInertTitle}
        />
      )}
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

function DataTableOptions(props: OptionsProps) {
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
  filterRef,
  filterPlaceholder,
  contextNote,
  copy,
  ...options
}: OptionsProps & {
  query: string;
  onQuery: (value: string) => void;
  /** The consumer's handle on the field — it focuses it when an external link
   *  sets the query, which is the one thing a controlled value cannot do. */
  filterRef?: RefObject<HTMLInputElement | null>;
  /** Doubles as the field's accessible name — it states the totals, which is
   *  the only place they appear once the list is grouped. */
  filterPlaceholder: string;
  /** Where these rows came from; absent = nothing to say. */
  contextNote?: string;
  /** The design's copy affordance, left of the gear. `null` reserves the slot
   *  for a payload that is not ready yet and draws nothing. */
  copy?: DataTableCopy | null;
}) {
  return (
    <div className="data-table-toolbar">
      <input
        className="data-table-filter"
        ref={filterRef}
        aria-label={filterPlaceholder}
        placeholder={filterPlaceholder}
        value={query}
        disabled={options.filtersInert}
        title={options.filtersInert ? options.filtersInertTitle : undefined}
        onChange={(event) => onQuery(event.target.value)}
      />
      {contextNote === undefined ? null : <span className="data-table-context">{contextNote}</span>}
      {copy === undefined || copy === null ? null : (
        <CopyButton
          getText={copy.getText}
          label={copy.label}
          className="data-table-copy"
          iconOnly
        />
      )}
      <DataTableOptions {...options} />
    </div>
  );
}
