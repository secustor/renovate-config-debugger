import type { PresetNode } from "@renovate-config-debugger/engine";
import type { NodeStats, TreeStats } from "@/components/preset-tree-stats";

/** Node ids whose subtree (self or any descendant) matches the query. */
function computeSubtreeMatch(
  root: PresetNode,
  statsById: Map<string, NodeStats>,
  q: string,
): Set<string> {
  const set = new Set<string>();
  const visit = (node: PresetNode): boolean => {
    let any = statsById.get(node.id)?.search.includes(q) ?? false;
    for (const child of node.children) {
      if (visit(child)) {
        any = true;
      }
    }
    if (any) {
      set.add(node.id);
    }
    return any;
  };
  for (const child of root.children) {
    visit(child);
  }
  return set;
}

export interface Row {
  node: PresetNode;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  /** Kept only for orientation while filtering (rendered dimmed). */
  dimmed: boolean;
  /** Routers shortcut by the hide-zero toggle between the shown parent and this node. */
  elidedChain: PresetNode[] | null;
  stats: NodeStats;
}

interface FlattenArgs {
  root: PresetNode;
  stats: TreeStats;
  expandedIdentities: ReadonlySet<string>;
  hideZero: boolean;
  query: string;
}

/** The tree collapsed to the ordered list of currently-visible rows. */
export function flattenTree({
  root,
  stats,
  expandedIdentities,
  hideZero,
  query,
}: FlattenArgs): Row[] {
  const { statsById, identityById } = stats;
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const subtreeMatch = searching ? computeSubtreeMatch(root, statsById, q) : null;
  const rows: Row[] = [];

  const emit = (node: PresetNode, depth: number, elided: PresetNode[]): void => {
    if (subtreeMatch && !subtreeMatch.has(node.id)) {
      return;
    }
    const st = statsById.get(node.id);
    if (!st) {
      return;
    }
    const isResolved = node.state === "resolved";
    const selfMatch = searching ? st.search.includes(q) : false;

    // Hide-zero: pure resolved routers are shortcut, promoting their
    // contributing descendants into this level with an elided-path chip.
    if (hideZero && isResolved && st.zero && !selfMatch) {
      if (node.children.length > 0) {
        for (const child of node.children) {
          emit(child, depth, [...elided, node]);
        }
      }
      return; // zero leaves simply vanish while the toggle is on (recoverable)
    }

    let hasChildren: boolean;
    if (searching) {
      hasChildren = node.children.some((c) => subtreeMatch?.has(c.id));
    } else if (hideZero) {
      hasChildren = st.descContrib > 0;
    } else {
      hasChildren = node.children.length > 0;
    }

    const expanded =
      hasChildren && (searching || expandedIdentities.has(identityById.get(node.id) ?? ""));

    rows.push({
      node,
      depth,
      hasChildren,
      expanded,
      dimmed: searching ? !selfMatch : false,
      elidedChain: elided.length > 0 ? elided : null,
      stats: st,
    });

    if (expanded) {
      for (const child of node.children) {
        emit(child, depth + 1, []);
      }
    }
  };

  for (const child of root.children) {
    emit(child, 0, []);
  }
  return rows;
}

export interface TableRow {
  node: PresetNode;
  name: string;
  sourceKind: string;
  opts: number;
  rules: number;
  count: number;
  search: string;
}

export type SortColumn = "name" | "source" | "opts" | "rules" | "count";

/** One row per unique resolved preset name for the flat table view. */
export function buildTableRows(stats: TreeStats): TableRow[] {
  const rows: TableRow[] = [];
  for (const [name, occurrences] of stats.occurrencesByName) {
    const first = occurrences.find((n) => n.state === "resolved");
    if (!first) {
      continue;
    }
    const st = stats.statsById.get(first.id);
    if (!st) {
      continue;
    }
    rows.push({
      node: first,
      name,
      sourceKind: first.source?.presetSource ?? "internal",
      opts: st.ownOptions,
      rules: st.ownRules,
      count: occurrences.length,
      search: st.search,
    });
  }
  return rows;
}

export function sortTableRows(rows: TableRow[], column: SortColumn, dir: 1 | -1): TableRow[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    let cmp: number;
    if (column === "name") {
      cmp = a.name.localeCompare(b.name);
    } else if (column === "source") {
      cmp = a.sourceKind.localeCompare(b.sourceKind) || a.name.localeCompare(b.name);
    } else {
      cmp = a[column] - b[column] || a.name.localeCompare(b.name);
    }
    return cmp * dir;
  });
  return sorted;
}
