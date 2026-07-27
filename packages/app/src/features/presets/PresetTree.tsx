import { memo, useEffect, useMemo, useState } from "react";
import type { PresetNode, TraceEvent, TraceResult } from "@renovate-config-visualizer/engine";
import { Term } from "@/components/glossary";
import { computeTreeStats } from "@/components/preset-tree-stats";
import type { AuthState } from "@/components/GithubAuthHint";
import { OriginFraming } from "./OriginFraming";
import { PresetDetail } from "./PresetDetail";
import { PresetListPane } from "./PresetListPane";
import { buildTableRows, flattenTree, type SortColumn, sortTableRows } from "./rows";
import { SummaryHeader } from "./SummaryHeader";
import { nf, ROW_HEIGHT } from "./tree-shared";
import { useEngineHelpers } from "./use-engine-helpers";
import { useWindow } from "./use-window";

/**
 * Roadmap 002 + 011: interactive tree of the recursive `extends` expansion,
 * made legible at `config:recommended` scale (~1,100 nodes). The tree is
 * conceptually a flat array of visible rows; only the rows intersecting the
 * scroll viewport are mounted (windowed render with top/bottom spacers), so a
 * thousand-node expansion never puts a thousand components in the DOM. Every
 * node carries contribution badges (own options / packageRules) and, when
 * collapsed, a subtree roll-up. A search box, a "hide zero-contribution
 * routers" toggle, a flat-table view and a summary header turn the raw tree
 * into an instrument for "what did all of that do?" and "where did this come
 * from?". All per-node/per-subtree aggregates are computed once per result in
 * a single walk (`computeTreeStats`), never per render.
 */

export const PresetTree = memo(function PresetTree({
  result,
  onInject,
  selectedId,
  onSelectNode,
  authState,
  onSignIn,
  installUrl,
}: {
  result: TraceResult;
  onInject: (key: string, content: Record<string, unknown>) => void;
  /** Controlled selection, so provenance chains (005) can select a preset node. */
  selectedId: string | null;
  onSelectNode: (id: string | null) => void;
  /** Sign-in state + hooks for the failed-GitHub-node hint (009). */
  authState: AuthState;
  onSignIn: () => void;
  installUrl: string;
}) {
  const root = result.presetTree;
  const helpers = useEngineHelpers();
  const injectionKey = helpers?.injectionKey ?? null;
  const usedInjections = useMemo(
    () => new Set(result.usedInjections ?? []),
    [result.usedInjections],
  );
  // Migration steps Renovate applied while fetching each preset (004), grouped
  // by the preset they belong to so the detail panel can show them per node.
  const migrationStepsByPreset = useMemo(() => {
    const map = new Map<string, TraceEvent[]>();
    for (const event of result.events) {
      const presetName = event.migration?.presetName;
      if (event.kind === "migration-applied" && presetName) {
        const list = map.get(presetName) ?? [];
        list.push(event);
        map.set(presetName, list);
      }
    }
    return map;
  }, [result.events]);

  const stats = useMemo(() => (root ? computeTreeStats(root) : null), [root]);

  const [view, setView] = useState<"tree" | "table">("tree");
  const [hideZero, setHideZero] = useState(false);
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>("count");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  // Expansion keyed by stable structural identity (name-path from root), so it
  // survives re-runs of the same config even though node ids restart at p1.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  // Debounce the filter box; the match pass is a full walk, so avoid running it
  // on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setQuery(rawQuery), 150);
    return () => clearTimeout(id);
  }, [rawQuery]);

  // On a new result, translate stored identities to the new tree: keep the ones
  // that still exist, drop the rest. Selection is reset by App separately.
  useEffect(() => {
    if (!stats) {
      return;
    }
    setExpanded((prev) => {
      const valid = new Set<string>();
      for (const id of prev) {
        if (stats.idByIdentity.has(id)) {
          valid.add(id);
        }
      }
      return valid.size === prev.size ? prev : valid;
    });
  }, [stats]);

  const flatRows = useMemo(
    () =>
      root && stats
        ? flattenTree({ root, stats, expandedIdentities: expanded, hideZero, query })
        : [],
    [root, stats, expanded, hideZero, query],
  );

  const tableRows = useMemo(() => {
    if (!stats) {
      return [];
    }
    const q = query.trim().toLowerCase();
    const base = buildTableRows(stats);
    const filtered = q ? base.filter((r) => r.search.includes(q)) : base;
    return sortTableRows(filtered, sortColumn, sortDir);
  }, [stats, query, sortColumn, sortDir]);

  const activeCount = view === "tree" ? flatRows.length : tableRows.length;
  const win = useWindow(activeCount);

  // Reverse lookup (005) + dedup cycling: when selection changes, open every
  // ancestor of the selected node so the row exists in the flattened list.
  useEffect(() => {
    if (!selectedId || !stats) {
      return;
    }
    const additions: string[] = [];
    let node: PresetNode | undefined = stats.nodesById.get(selectedId);
    while (node) {
      const parent = stats.parents.get(node.id);
      if (!parent) {
        break;
      }
      additions.push(stats.identityById.get(parent.id) ?? "");
      node = parent;
    }
    if (additions.length === 0) {
      return;
    }
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of additions) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selectedId, stats]);

  // …then scroll the selected row into view once it is in the flattened list.
  useEffect(() => {
    if (!selectedId || view !== "tree") {
      return;
    }
    const idx = flatRows.findIndex((r) => r.node.id === selectedId);
    const el = win.el;
    if (idx < 0 || !el) {
      return;
    }
    const top = idx * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    if (top < el.scrollTop) {
      el.scrollTop = top;
    } else if (bottom > el.scrollTop + el.clientHeight) {
      el.scrollTop = bottom - el.clientHeight;
    }
  }, [selectedId, flatRows, view, win.el]);

  if (!root || root.children.length === 0 || !stats) {
    return null;
  }
  const selected = selectedId ? stats.nodesById.get(selectedId) : undefined;

  function toggle(identity: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(identity)) {
        next.delete(identity);
      } else {
        next.add(identity);
      }
      return next;
    });
  }

  function cycleDup(node: PresetNode) {
    const list = stats?.occurrencesByName.get(node.name);
    if (!list || list.length < 2) {
      return;
    }
    const i = list.findIndex((n) => n.id === node.id);
    const next = list[(i + 1) % list.length];
    if (next) {
      onSelectNode(next.id);
    }
  }

  function toggleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortColumn(column);
      setSortDir(column === "name" || column === "source" ? 1 : -1);
    }
  }

  const treeSlice = flatRows.slice(win.start, win.end);
  const tableSlice = tableRows.slice(win.start, win.end);

  const columns: { key: SortColumn; label: string }[] = [
    { key: "name", label: "preset" },
    { key: "source", label: "source" },
    { key: "opts", label: "opts" },
    { key: "rules", label: "rules" },
    { key: "count", label: "count" },
  ];

  return (
    <div className="card">
      <div className="card-title">
        <Term id="preset">Preset</Term> resolution tree ({nf.format(stats.summary.resolved)}{" "}
        resolved)
      </div>
      <OriginFraming root={root} stats={stats} />
      <SummaryHeader summary={stats.summary} />
      <div className="preset-controls">
        <input
          type="text"
          className="preset-search"
          placeholder="Filter by preset, option key, or package name…"
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
        />
        <label
          className="preset-check"
          title="Shortcut pure extends routers to the presets that actually changed something"
        >
          <input
            type="checkbox"
            checked={hideZero}
            onChange={(e) => setHideZero(e.target.checked)}
          />{" "}
          hide zero-contribution
        </label>
        {/* Roadmap 036: `.preset-view-toggle` generalized into `.seg` — the one
            segmented-control chrome, now shared with the diff chrome row and
            the theme switcher. */}
        <div className="seg" role="group" aria-label="View">
          <button
            type="button"
            className={view === "tree" ? "active" : ""}
            onClick={() => setView("tree")}
          >
            tree
          </button>
          <button
            type="button"
            className={view === "table" ? "active" : ""}
            onClick={() => setView("table")}
          >
            table
          </button>
        </div>
      </div>
      {/* Roadmap 035: the query container for the tree/detail split — it has to
          be a wrapper rather than the layout grid itself, since an element
          cannot query its own size. */}
      <div className="preset-split">
        <div className={`preset-tree-layout${selected ? " with-panel" : ""}`}>
          <PresetListPane
            view={view}
            columns={columns}
            sortColumn={sortColumn}
            sortDir={sortDir}
            onToggleSort={toggleSort}
            win={win}
            activeCount={activeCount}
            treeSlice={treeSlice}
            tableSlice={tableSlice}
            selectedId={selectedId}
            onSelectNode={onSelectNode}
            onToggle={toggle}
            onCycleDup={cycleDup}
            injectionKey={injectionKey}
            usedInjections={usedInjections}
            stats={stats}
          />
          {selected ? (
            <PresetDetail
              node={selected}
              parent={stats.parents.get(selected.id)}
              onClose={() => onSelectNode(null)}
              injectionKey={injectionKey}
              parse={helpers?.parse ?? null}
              usedInjections={usedInjections}
              onInject={onInject}
              migrationSteps={migrationStepsByPreset.get(selected.name) ?? []}
              authState={authState}
              onSignIn={onSignIn}
              installUrl={installUrl}
            />
          ) : (
            <div className="preset-panel-hint">Select a preset to inspect it.</div>
          )}
        </div>
      </div>
    </div>
  );
});
