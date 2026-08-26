import type { PresetNode } from "@renovate-config-debugger/engine";
import type { TreeStats } from "@/lib/preset-tree-stats";
import { presetTableRowClass } from "@/lib/preset-row-dom";
import type { NodeDescriptionFacts } from "@/lib/tree-descriptions";
import type { Row, SortColumn, TableRow } from "./rows";
import { type InjectionKeyFn, ROW_HEIGHT } from "./tree-shared";
import { TreeRow } from "./TreeRow";
import type { useWindow } from "./use-window";

/** Roadmap 011/040: the list half of the tree/detail split — the table header
 *  (when sorting applies) over the windowed row slice. Its own component since
 *  040's depth ratchet, which the windowing padding spacers pushed past. */
export function PresetListPane({
  view,
  columns,
  sortColumn,
  sortDir,
  onToggleSort,
  win,
  activeCount,
  treeSlice,
  tableSlice,
  selectedId,
  onSelectNode,
  onToggle,
  onCycleDup,
  injectionKey,
  usedInjections,
  stats,
  descFacts,
  onShowDescriptionOrder,
}: {
  view: "tree" | "table";
  columns: { key: SortColumn; label: string }[];
  sortColumn: SortColumn;
  sortDir: 1 | -1;
  onToggleSort: (column: SortColumn) => void;
  win: ReturnType<typeof useWindow>;
  activeCount: number;
  treeSlice: Row[];
  tableSlice: TableRow[];
  selectedId: string | null;
  onSelectNode: (id: string | null) => void;
  onToggle: (identity: string) => void;
  onCycleDup: (node: PresetNode) => void;
  injectionKey: InjectionKeyFn | null;
  usedInjections: ReadonlySet<string>;
  stats: TreeStats;
  /** Roadmap 069 (PR 4): the per-node description index — `null` when the run
   *  has no description facts, and then no name carries a hover card. */
  descFacts: ReadonlyMap<string, NodeDescriptionFacts> | null;
  onShowDescriptionOrder?: () => void;
}) {
  // Destructured rather than read as `win.…` below: `win.ref` is a CALLBACK
  // ref, and handing a member of an object to `ref=` makes `react/refs` treat
  // every other member of that object as a ref read during render too — which
  // `padTop`/`padBottom` (plain numbers derived from scroll state, and the
  // whole point of this render) are not.
  const { ref: containerRef, padTop, padBottom } = win;
  return (
    <div>
      {view === "table" ? (
        // Deliberately NO `role="row"`. It used to carry one, and that was an
        // orphan: this header sits OUTSIDE the scroll container below (it must
        // not scroll away), so its row had no table to belong to — and
        // `role="row"` requires an owning table/grid/rowgroup. A row with no
        // table is dropped from the accessibility tree by some AT and reported
        // as a stray row by others. Five sort buttons announce themselves.
        <div className="preset-table-head">
          {columns.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`preset-th col-${c.key}${sortColumn === c.key ? " sorted" : ""}`}
              onClick={() => onToggleSort(c.key)}
            >
              {c.label}
              {sortColumn === c.key ? (sortDir === 1 ? " ▲" : " ▼") : ""}
            </button>
          ))}
        </div>
      ) : null}
      {/* `role="tree"` for the tree view only. The table view used to claim
          `role="table"` and it was not one: its children are the two virtual
          padding spacers and a flat list of `<button>`s, none of them a `row`
          or a `cell`, and the header row was not even inside it. AT therefore
          announced "table, 0 rows" over a list that visibly had hundreds —
          worse than no role at all. A real grid here means cells, roving
          keyboard nav, and `aria-rowcount`/`aria-rowindex` to undo the
          windowing; until that exists the buttons speak for themselves. */}
      <div className="preset-tree" role={view === "tree" ? "tree" : undefined} ref={containerRef}>
        {activeCount === 0 ? (
          <p className="empty-note">No presets match the filter.</p>
        ) : (
          <>
            <div style={{ height: padTop }} />
            {view === "tree"
              ? treeSlice.map((row) => (
                  <TreeRow
                    key={row.node.id}
                    row={row}
                    selectedId={selectedId}
                    onToggle={onToggle}
                    onSelect={onSelectNode}
                    onCycleDup={onCycleDup}
                    injectionKey={injectionKey}
                    usedInjections={usedInjections}
                    dupCount={stats.occurrencesByName.get(row.node.name)?.length ?? 1}
                    facts={descFacts?.get(row.node.id)}
                    onShowDescriptionOrder={onShowDescriptionOrder}
                  />
                ))
              : tableSlice.map((r) => (
                  <PresetTableRow
                    key={r.node.id}
                    row={r}
                    selected={r.node.id === selectedId}
                    onSelect={onSelectNode}
                  />
                ))}
            <div style={{ height: padBottom }} />
          </>
        )}
      </div>
    </div>
  );
}

/** One row of the flat table view — the same five columns its header sorts by.
 *  Its own component since 040's depth ratchet: the source cell nests a badge
 *  inside the cell inside the row button. */
function PresetTableRow({
  row,
  selected,
  onSelect,
}: {
  row: TableRow;
  selected: boolean;
  onSelect: (id: string | null) => void;
}) {
  return (
    <button
      type="button"
      // Written through the module that also spells the selector App's landing
      // finds this row by (`lib/preset-row-dom.ts`), same as the tree's rows.
      className={presetTableRowClass(selected)}
      style={{ height: ROW_HEIGHT }}
      onClick={() => onSelect(row.node.id)}
    >
      <span className="col-name">{row.name}</span>
      <span>
        <span className={`badge src src-${row.sourceKind}`}>{row.sourceKind}</span>
      </span>
      <span className="col-opts">{row.opts || ""}</span>
      <span className="col-rules">{row.rules || ""}</span>
      <span className="col-count">{row.count > 1 ? `×${row.count}` : ""}</span>
    </button>
  );
}
