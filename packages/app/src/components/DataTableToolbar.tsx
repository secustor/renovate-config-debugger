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

/** Octicon `gear`, inlined like CopyButton's paths — no icon dep (031). An SVG
 *  at the copy icon's exact 14×14, not a text glyph: `⚙` renders well under
 *  its em box and made the button read smaller than its neighbour. */
const GEAR_PATH =
  "M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.038.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 0 1-.704 1.217c-.428.61-1.176.807-1.82.63l-1.102-.302c-.067-.019-.177-.011-.3.071a5.909 5.909 0 0 1-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 0 1-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.12 8.12 0 0 1-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 0 1 0-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 0 1 .704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C6.009.645 6.556.095 7.299.03 7.53.01 7.764 0 8 0Zm-.571 1.525c-.036.003-.108.036-.137.146l-.289 1.105c-.147.561-.549.967-.998 1.189-.173.086-.34.183-.5.29-.417.278-.97.423-1.529.27l-1.103-.303c-.109-.03-.175.016-.195.045-.22.312-.412.644-.573.99-.014.031-.021.11.059.19l.815.806c.411.406.562.957.53 1.456a4.709 4.709 0 0 0 0 .582c.032.499-.119 1.05-.53 1.456l-.815.806c-.081.08-.073.159-.059.19.162.346.353.677.573.989.02.03.085.076.195.046l1.102-.303c.56-.153 1.113-.008 1.53.27.161.107.328.204.501.29.447.222.85.629.997 1.189l.289 1.105c.029.109.101.143.137.146a6.6 6.6 0 0 0 1.142 0c.036-.003.108-.036.137-.146l.289-1.105c.147-.561.549-.967.998-1.189.173-.086.34-.183.5-.29.417-.278.97-.423 1.529-.27l1.103.303c.109.029.175-.016.195-.045.22-.313.411-.644.573-.99.014-.031.021-.11-.059-.19l-.815-.806c-.411-.406-.562-.957-.53-1.456a4.709 4.709 0 0 0 0-.582c-.032-.499.119-1.05.53-1.456l.815-.806c.081-.08.073-.159.059-.19a6.464 6.464 0 0 0-.573-.989c-.02-.03-.085-.076-.195-.046l-1.102.303c-.56.153-1.113.008-1.53-.27a4.44 4.44 0 0 0-.501-.29c-.447-.222-.85-.629-.997-1.189l-.289-1.105c-.029-.11-.101-.143-.137-.146a6.6 6.6 0 0 0-1.142 0ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9.5 8a1.5 1.5 0 1 0-3.001.001A1.5 1.5 0 0 0 9.5 8Z";

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d={GEAR_PATH} />
    </svg>
  );
}

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
        className="btn-secondary icon-only data-table-gear"
        aria-label="Display options"
        title="Display options"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      >
        <GearIcon />
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
  copy,
  ...options
}: OptionsProps & {
  query: string;
  onQuery: (value: string) => void;
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
