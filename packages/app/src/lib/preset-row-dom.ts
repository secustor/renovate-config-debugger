/**
 * Roadmap 067, ninth review: the same treatment `results-tab-dom.ts` gave
 * `data-tab`, for the other element App's landings reach across the lazy
 * results boundary for — the SELECTED preset row.
 *
 * There are two of them, because the tree and the flat table are two views of
 * one selection: the tree's node-name button (`TreeRow`) and the table's row
 * button (`PresetListPane`). Both are real buttons, which is what makes them a
 * landing site (`landOnPresetNode` in App.tsx); App holds a handle to neither,
 * so it finds them by class — and until this module existed it spelled those
 * classes out itself, where renaming either one in the presets feature
 * type-checked clean and silently broke the landing.
 *
 * The class names are written here exactly once, and both the components that
 * render them and the landing that looks for them go through these exports.
 * Here rather than in either component file because a non-component export from
 * a component file costs that file its Fast Refresh
 * (`react/only-export-components`, error since roadmap 041) — the same reason
 * `results-tab-dom.ts` is not inside `ResultsPanel.tsx`.
 *
 * The stylesheet still names the classes independently (`index.css`), as it
 * must — that half is CSS's, and no export can make it type-check.
 */

const TREE_ROW_NAME = "preset-name";
const TABLE_ROW = "preset-table-row";
/** The selection marker both views carry, and the whole point of the selector
 *  below: the landing wants the CURRENT node, not a row. */
const SELECTED = "selected";

/** The tree's node-name button (`TreeRow`) — the write half. */
export function presetTreeNameClass(selected: boolean): string {
  return selected ? `${TREE_ROW_NAME} ${SELECTED}` : TREE_ROW_NAME;
}

/** The flat table's row button (`PresetListPane`) — the write half. */
export function presetTableRowClass(selected: boolean): string {
  return selected ? `${TABLE_ROW} ${SELECTED}` : TABLE_ROW;
}

/** The selected row in whichever view the tree is showing, for a
 *  `querySelector`. Only one of the two views is rendered at a time, and the
 *  selection is one node, so this matches at most one element. */
export const SELECTED_PRESET_ROW = `.${TREE_ROW_NAME}.${SELECTED}, .${TABLE_ROW}.${SELECTED}`;
