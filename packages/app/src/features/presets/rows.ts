import type { PresetNode } from "@renovate-config-debugger/engine";
import type { NodeStats, TreeStats } from "@/lib/preset-tree-stats";

/**
 * Node ids whose SUBTREE satisfies `hit` — the node itself, or any descendant.
 *
 * A post-order walk: a node is marked when its own test passes or when any
 * child came back marked, so one pass marks every ancestor of every hit. Both
 * callers below need exactly that, differing only in what counts as a hit, and
 * both used to spell the whole traversal out. The second one's comment said so
 * ("the same shape as `computeSubtreeMatch`, and computed for the same
 * reason"), which is the tell that the predicate was the only real parameter.
 *
 * `root` itself is deliberately not tested or marked — it is the synthetic tree
 * root, not a preset anyone can see or expand.
 */
function markMatchingSubtrees(root: PresetNode, hit: (node: PresetNode) => boolean): Set<string> {
  const set = new Set<string>();
  const visit = (node: PresetNode): boolean => {
    let any = hit(node);
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

/** Node ids whose subtree (self or any descendant) matches the query. */
function computeSubtreeMatch(
  root: PresetNode,
  statsById: Map<string, NodeStats>,
  q: string,
): Set<string> {
  return markMatchingSubtrees(root, (node) => statsById.get(node.id)?.search.includes(q) ?? false);
}

/**
 * Node ids with a description fact somewhere in their subtree (self included).
 *
 * Roadmap 069 (PR 4): hide-zero's caret suppression (`descContrib > 0`) counts
 * CONTRIBUTING descendants, and a wrapper preset contributes nothing — so
 * without this a described node could sit behind a caret that never renders,
 * leaving its description hover card unreachable.
 */
function computeDescribedSubtree(root: PresetNode, described: ReadonlySet<string>): Set<string> {
  return markMatchingSubtrees(root, (node) => described.has(node.id));
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
  /**
   * Roadmap 069 (PR 4): node ids that carry a description fact — `null` when
   * the run has none, where this argument changes nothing at all.
   *
   * Hide-zero shortcuts pure `extends` routers, and a WRAPPER preset is one:
   * `getPreset` deletes its description, leaving a body of only `extends`. Its
   * row would therefore be elided exactly when it has a description to show —
   * and the hover card on its name is the only place in the tree that shows
   * it. So a described node is never elided; hide-zero still applies to its
   * subtree, which is promoted through it as before.
   */
  described?: ReadonlySet<string> | null;
}

/** The tree collapsed to the ordered list of currently-visible rows. */
export function flattenTree({
  root,
  stats,
  expandedIdentities,
  hideZero,
  query,
  described = null,
}: FlattenArgs): Row[] {
  const { statsById, identityById } = stats;
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const subtreeMatch = searching ? computeSubtreeMatch(root, statsById, q) : null;
  // Only hide-zero elides or suppresses carets, so this is the only mode that
  // has to know where the described nodes are.
  const describedSubtree =
    hideZero && described && described.size > 0 ? computeDescribedSubtree(root, described) : null;
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

    const shortcut = hideZero && isResolved && st.zero && !selfMatch;
    // …unless it carries a description fact (see `described`): then the row
    // mounts, and the shortcut applies to its subtree only.
    const describedSelf = described?.has(node.id) ?? false;

    // Hide-zero: pure resolved routers are shortcut, promoting their
    // contributing descendants into this level with an elided-path chip.
    if (shortcut && !describedSelf) {
      if (node.children.length > 0) {
        for (const child of node.children) {
          emit(child, depth, [...elided, node]);
        }
      }
      return; // zero leaves simply vanish while the toggle is on (recoverable)
    }

    let hasChildren: boolean;
    if (shortcut) {
      // Kept only for its description: its subtree is shown THROUGH it below,
      // unconditionally, so there is nothing a caret could collapse.
      hasChildren = false;
    } else if (searching) {
      hasChildren = node.children.some((c) => subtreeMatch?.has(c.id));
    } else if (hideZero) {
      hasChildren =
        st.descContrib > 0 ||
        (describedSubtree !== null && node.children.some((c) => describedSubtree.has(c.id)));
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

    if (expanded || shortcut) {
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
      opts: st.optionKeys.length,
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
