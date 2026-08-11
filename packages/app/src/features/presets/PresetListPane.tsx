import type { PresetNode } from "@renovate-config-debugger/engine";
import type { TreeStats } from "@/components/preset-tree-stats";
import { presetTableRowClass } from "@/lib/preset-row-dom";
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
}) {
  return (
    <div>
      {view === "table" ? (
        <div className="preset-table-head" role="row">
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
      <div className="preset-tree" role={view === "tree" ? "tree" : "table"} ref={win.ref}>
        {activeCount === 0 ? (
          <p className="empty-note">No presets match the filter.</p>
        ) : (
          <>
            <div style={{ height: win.padTop }} />
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
            <div style={{ height: win.padBottom }} />
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
      <span className="col-source">
        <span className={`badge src src-${row.sourceKind}`}>{row.sourceKind}</span>
      </span>
      <span className="col-opts">{row.opts || ""}</span>
      <span className="col-rules">{row.rules || ""}</span>
      <span className="col-count">{row.count > 1 ? `×${row.count}` : ""}</span>
    </button>
  );
}
