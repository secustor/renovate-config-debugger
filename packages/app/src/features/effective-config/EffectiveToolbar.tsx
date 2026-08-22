import type { RefObject } from "react";
import { CopyButton } from "@/components/CopyButton";
import { SegmentedControl, type SegmentedOption } from "@/components/SegmentedControl";

/** Roadmap 051: the card's two renderings — provenance rows / a standalone
 *  JSON document. A MODE, not a filter: the JSON view is a different document
 *  (and a different computation), so it must not sit in the filter bar where
 *  checkboxes promise row-level composition. */
export type EffectiveView = "keys" | "json";

const VIEW_OPTIONS: readonly SegmentedOption<EffectiveView>[] = [
  { value: "keys", label: "By key" },
  { value: "json", label: "As JSON" },
];

/** Roadmap 051: the view switch. Segmented, like the diff's unified/side-by-side
 *  control and for the same 036 reason — it labels the STATE, not an action, so
 *  the active rendering is always legible. Roadmap 082 moves it out of the card
 *  title into the one toolbar row, pushed right, where the design has it. */
function ViewSwitch({
  view,
  onViewChange,
}: {
  view: EffectiveView;
  onViewChange: (view: EffectiveView) => void;
}) {
  return (
    <SegmentedControl
      className="prov-toolbar-switch"
      label="Effective config view"
      value={view}
      options={VIEW_OPTIONS}
      onChange={onViewChange}
    />
  );
}

/**
 * Roadmap 082 (GAP-1/GAP-2): ONE toolbar row, in BOTH views — the key filter,
 * the "only overridden" gate, the By key / As JSON switch pushed right, and the
 * copy button. It used to be two rows in two places (the switch and the copy in
 * the card title, the filters in a chrome row that existed only in the By-key
 * view), which made the two halves of one control strip look like controls of
 * two different things.
 *
 * The layer `<select>` and the "show default-only" checkbox are gone with it:
 * neither is in the design, and what the checkbox gated is now the always-there
 * defaults band below.
 */
export function EffectiveToolbar({
  filterInputRef,
  query,
  onQueryChange,
  onlyOverridden,
  onOnlyOverriddenChange,
  filtersApply,
  view,
  onViewChange,
  getText,
}: {
  filterInputRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (value: string) => void;
  onlyOverridden: boolean;
  onOnlyOverriddenChange: (checked: boolean) => void;
  /** False in the As-JSON view: the filters narrow ROWS, and that document is
   *  copied whole (see the note on `EffectiveView`). */
  filtersApply: boolean;
  view: EffectiveView;
  onViewChange: (view: EffectiveView) => void;
  /** Null while the document is still being derived — same wait as the
   *  As-JSON view's own copy, which this one is a second door to. */
  getText: (() => string) | null;
}) {
  const inertTitle = filtersApply
    ? undefined
    : "Key filters narrow the By key rows — the JSON document is always the whole config";
  return (
    <div className="prov-filters prov-toolbar">
      <input
        ref={filterInputRef}
        type="text"
        className="prov-filter-input"
        placeholder="Filter keys…"
        value={query}
        disabled={!filtersApply}
        title={inertTitle}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      <label className="prov-check" title={inertTitle}>
        <input
          type="checkbox"
          checked={onlyOverridden}
          disabled={!filtersApply}
          onChange={(e) => onOnlyOverriddenChange(e.target.checked)}
        />{" "}
        only overridden
      </label>
      <ViewSwitch view={view} onViewChange={onViewChange} />
      {getText ? (
        <CopyButton
          iconOnly
          getText={getText}
          label="Copy effective config as JSON"
          title="Copy effective config as JSON"
        />
      ) : null}
    </div>
  );
}
