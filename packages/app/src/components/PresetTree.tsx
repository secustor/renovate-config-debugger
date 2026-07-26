import { memo, useEffect, useMemo, useState, type CSSProperties } from "react";
import type {
  PresetNode,
  PresetSourceRef,
  TraceEvent,
  TraceResult,
} from "@renovate-config-visualizer/engine";
import { Explained, Term } from "../glossary";
import {
  computeTreeStats,
  type NodeStats,
  type TreeStats,
  type TreeSummary,
} from "./preset-tree-stats";
import { GLOSSARY, type GlossaryEntry } from "../glossary-data";
import { ConfigJson } from "./ConfigJson";
import { CopyMarkdownButton } from "./CopyMarkdownButton";
import { type AuthState, GithubAuthHint } from "./GithubAuthHint";
import { findPollutedPath } from "../input-schemas";
import { JsonDiff } from "./JsonDiff";
import { MigrationSteps } from "./MigrationSteps";

/**
 * A failed GitHub preset node whose error is the private-repo (not-found) or
 * auth/rate-limit kind — the cases where signing in is the likely fix (009).
 * Matches the exact strings the engine's github fetcher emits.
 */
function githubAuthFailure(node: PresetNode): { match: boolean; rateLimited: boolean } {
  if (node.state !== "error" || node.source?.presetSource !== "github") {
    return { match: false, rateLimited: false };
  }
  const msg = node.error?.message ?? "";
  const rateLimited = /rate limit or missing token/i.test(msg);
  const notFound = /dep not found/i.test(msg);
  return { match: rateLimited || notFound, rateLimited };
}

type InjectionKeyFn = (id: {
  presetSource: string;
  repo?: string;
  presetPath?: string;
  presetName?: string;
  tag?: string;
}) => string;
type ParseFn = (text: string) => Record<string, unknown>;

/** Injection key for a node, or null when its source could not be parsed. */
function nodeInjectionKey(
  source: PresetSourceRef | undefined,
  keyFn: InjectionKeyFn | null,
): string | null {
  if (!source?.presetSource || !keyFn) {
    return null;
  }
  return keyFn({
    presetSource: source.presetSource,
    repo: source.repo,
    presetPath: source.presetPath,
    presetName: source.presetName,
    tag: source.tag,
  });
}

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

type MergeFn = (
  parent: Record<string, unknown>,
  child: Record<string, unknown>,
) => Record<string, unknown>;

const STATE_LABELS: Record<PresetNode["state"], string | null> = {
  resolved: null,
  error: "failed",
  ignored: "ignored via ignorePresets",
  "already-seen": "skipped — already in its own ancestor chain",
  aborted: "not resolved — run aborted by an earlier error",
};

/** Fixed row height keeps the windowing math trivial; rows never wrap. */
const ROW_HEIGHT = 26;
const INDENT = 14;
const OVERSCAN = 8;

const nf = new Intl.NumberFormat();

/** Roadmap 016: hover-card text for a preset's `src-<kind>` badge — internal
 *  presets reuse the summary header's wording; every fetched kind gets a
 *  kind-specific explanation of where it came from. */
function sourceKindEntry(kind: string): GlossaryEntry {
  if (kind === "internal") {
    return GLOSSARY.presetSourceInternal;
  }
  const HOST_TEXT: Record<string, string> = {
    github: "Fetched from a repository on GitHub.",
    gitlab: "Fetched from a repository on GitLab.",
    gitea: "Fetched from a repository on Gitea.",
    forgejo: "Fetched from a repository on Forgejo.",
    npm: "Fetched from the npm registry package's config.",
    http: "Fetched from a raw HTTP(S) URL.",
    local: "Resolved as a `local>` preset against the configured platform and repository.",
  };
  return {
    name: `${kind} preset`,
    plain: HOST_TEXT[kind] ?? GLOSSARY.presetSourceFetched.plain,
  };
}

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

interface Row {
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
function flattenTree({ root, stats, expandedIdentities, hideZero, query }: FlattenArgs): Row[] {
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

interface TableRow {
  node: PresetNode;
  name: string;
  sourceKind: string;
  opts: number;
  rules: number;
  count: number;
  search: string;
}

type SortColumn = "name" | "source" | "opts" | "rules" | "count";

/** One row per unique resolved preset name for the flat table view. */
function buildTableRows(stats: TreeStats): TableRow[] {
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

function sortTableRows(rows: TableRow[], column: SortColumn, dir: 1 | -1): TableRow[] {
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

/** Loads the engine helpers the tree needs (merge + injection key/parse). */
function useEngineHelpers() {
  const [helpers, setHelpers] = useState<{
    merge: MergeFn;
    injectionKey: InjectionKeyFn;
    parse: ParseFn;
  } | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const engine = await import("@renovate-config-visualizer/engine");
      if (live) {
        setHelpers({
          merge: engine.mergeChildConfig as MergeFn,
          injectionKey: engine.presetInjectionKey as InjectionKeyFn,
          parse: engine.parseInjectedPreset as ParseFn,
        });
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  return helpers;
}

/**
 * Windowing state for a scroll container: which slice of rows to mount. The
 * container is captured through a callback ref held in state, so the scroll
 * listener re-attaches whenever the element (re)mounts, not just on first run.
 */
function useWindow(count: number) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(400);

  useEffect(() => {
    if (!el) {
      return;
    }
    const update = () => {
      setScrollTop(el.scrollTop);
      // Roadmap 028: this container now mounts inside a hidden tab panel,
      // where it measures 0 and would window down to almost no rows until the
      // ResizeObserver fires on reveal (a frame later). Keeping the last known
      // (or default) viewport until a REAL measurement arrives means the tree
      // is already populated the instant its tab is opened.
      const height = el.clientHeight;
      if (height > 0) {
        setViewport(height);
      }
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [el]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(count, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN);
  return {
    ref: setEl,
    el,
    start,
    end,
    padTop: start * ROW_HEIGHT,
    padBottom: Math.max(0, (count - end) * ROW_HEIGHT),
  };
}

/** Regular English plural — every summary/badge word here happens to take a
 *  plain trailing "s", so one helper covers them all. */
function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

/**
 * Roadmap 016: the counter strip gets the same hover-card treatment the stage
 * pills already have (persona study finding 6) instead of a plain `title`
 * tooltip, plus grammatically-correct singular/plural labels (was always "N
 * duplicates" etc. even at N=1).
 */
function SummaryHeader({ summary }: { summary: TreeSummary }) {
  const bits: { key: keyof typeof GLOSSARY; label: string; value: number }[] = [
    { key: "statPresets", label: plural(summary.resolved, "preset"), value: summary.resolved },
    { key: "statFetched", label: "fetched", value: summary.fetched },
    { key: "statInternal", label: "internal", value: summary.internal },
    {
      key: "statOptionsSet",
      label: `option${summary.options === 1 ? "" : "s"} set`,
      value: summary.options,
    },
    { key: "statRules", label: plural(summary.rules, "rule"), value: summary.rules },
    { key: "statDepth", label: "depth", value: summary.maxDepth },
    {
      key: "statDuplicates",
      label: `repeat occurrence${summary.duplicates === 1 ? "" : "s"}`,
      value: summary.duplicates,
    },
    { key: "statErrors", label: plural(summary.errors, "error"), value: summary.errors },
  ];
  return (
    <div className="preset-summary">
      {bits.map((b) => (
        <Explained key={b.key} entry={GLOSSARY[b.key]}>
          {(handlers) => (
            <span className="preset-summary-stat explained" tabIndex={0} {...handlers}>
              <strong>{nf.format(b.value)}</strong> {b.label}
            </span>
          )}
        </Explained>
      ))}
    </div>
  );
}

/**
 * Roadmap 016: honest origin framing for the headline preset count (persona
 * study finding 6 — "Resolved 1076 preset(s)" reads as "did I break
 * something?" with no origin attached). Purely a derivation of the already-
 * computed per-node stats, never a re-walk; never claims precision it doesn't
 * have (a dominant contributor is only named when it is a clear majority).
 */
function OriginFraming({ root, stats }: { root: PresetNode; stats: TreeStats }) {
  const roots = root.children;
  const total = stats.summary.resolved;
  if (roots.length === 0 || total <= 1) {
    return null;
  }
  const contributions = roots
    .map((child) => {
      const st = stats.statsById.get(child.id);
      const selfResolved = child.state === "resolved" ? 1 : 0;
      return { name: child.name, count: (st?.descResolved ?? 0) + selfResolved };
    })
    .toSorted((a, b) => b.count - a.count);
  const top = contributions[0];

  const [onlyRoot] = roots;
  if (roots.length === 1 && onlyRoot) {
    return (
      <p className="origin-framing">
        Your <Term id="extends">extends</Term> entry <code>{onlyRoot.name}</code> expands to{" "}
        {nf.format(total)} preset{total === 1 ? "" : "s"}.
      </p>
    );
  }

  // Only named when it is a clear majority — narrowed to the contribution
  // itself (not a boolean) so the JSX below reads it without an assertion.
  const majority = top && top.count > 1 && top.count / total > 0.5 ? top : null;
  return (
    <p className="origin-framing">
      Your {nf.format(roots.length)} <Term id="extends">extends</Term> entries expand to{" "}
      {nf.format(total)} preset{total === 1 ? "" : "s"}
      {majority ? (
        <>
          , mostly via <code>{majority.name}</code> ({nf.format(majority.count)})
        </>
      ) : null}
      .
    </p>
  );
}

function ContributionBadges({ stats, collapsed }: { stats: NodeStats; collapsed: boolean }) {
  return (
    <>
      {stats.ownOptions > 0 ? (
        <Explained entry={GLOSSARY.presetContribOpts}>
          {(handlers) => (
            <span className="badge contrib opts explained" tabIndex={0} {...handlers}>
              {stats.ownOptions} opt{stats.ownOptions === 1 ? "" : "s"}
            </span>
          )}
        </Explained>
      ) : null}
      {stats.ownRules > 0 ? (
        <Explained entry={GLOSSARY.presetContribRules}>
          {(handlers) => (
            <span className="badge contrib rules explained" tabIndex={0} {...handlers}>
              {stats.ownRules} rule{stats.ownRules === 1 ? "" : "s"}
            </span>
          )}
        </Explained>
      ) : null}
      {collapsed && (stats.descResolved > 0 || stats.descRules > 0) ? (
        <Explained entry={GLOSSARY.presetRollup}>
          {(handlers) => (
            <span className="badge rollup explained" tabIndex={0} {...handlers}>
              {stats.descResolved > 0 ? `· ${nf.format(stats.descResolved)} presets ` : ""}
              {stats.descRules > 0 ? `· ${nf.format(stats.descRules)} rules` : ""}
            </span>
          )}
        </Explained>
      ) : null}
    </>
  );
}

function TreeRow({
  row,
  selectedId,
  onToggle,
  onSelect,
  onCycleDup,
  injectionKey,
  usedInjections,
  dupCount,
}: {
  row: Row;
  selectedId: string | null;
  onToggle: (identity: string) => void;
  onSelect: (id: string) => void;
  onCycleDup: (node: PresetNode) => void;
  injectionKey: InjectionKeyFn | null;
  usedInjections: ReadonlySet<string>;
  dupCount: number;
}) {
  const { node, stats } = row;
  const stateLabel = STATE_LABELS[node.state];
  const key = nodeInjectionKey(node.source, injectionKey);
  const userSupplied = key !== null && usedInjections.has(key);
  const style: CSSProperties = {
    height: ROW_HEIGHT,
    paddingLeft: row.depth * INDENT,
  };
  const chain = row.elidedChain;
  // Hoisted out of the JSX: the render-prop closure below is created inside a
  // callback, so `node.source?.presetSource` re-widens to `| undefined` there.
  const presetSource = node.source?.presetSource;

  return (
    <div
      className={`preset-row state-${node.state}${stats.zero ? " zero" : ""}${row.dimmed ? " dimmed" : ""}`}
      role="treeitem"
      aria-expanded={row.hasChildren ? row.expanded : undefined}
      style={style}
    >
      {row.hasChildren ? (
        <button
          type="button"
          className="caret"
          onClick={() => onToggle(stats.identity)}
          aria-label={row.expanded ? "Collapse" : "Expand"}
        >
          {row.expanded ? "▾" : "▸"}
        </button>
      ) : (
        <span className="caret-spacer" />
      )}
      {chain ? (
        <button
          type="button"
          className="badge elided"
          title={`Routers skipped: ${chain.map((n) => n.name).join(" › ")} (click to select)`}
          onClick={() => {
            const last = chain[chain.length - 1];
            if (last) {
              onSelect(last.id);
            }
          }}
        >
          {chain[0]?.name}
          {chain.length > 1 ? " › … " : " "}›
        </button>
      ) : null}
      <button
        type="button"
        className={`preset-name${node.id === selectedId ? " selected" : ""}`}
        onClick={() => onSelect(node.id)}
      >
        {node.name}
      </button>
      {presetSource ? (
        <Explained entry={sourceKindEntry(presetSource)}>
          {(handlers) => (
            <span className={`badge src src-${presetSource} explained`} tabIndex={0} {...handlers}>
              {presetSource}
            </span>
          )}
        </Explained>
      ) : null}
      {node.source?.platform ? (
        <span
          className="badge via"
          title={`local> resolved against ${node.source.platform} @ ${node.source.endpoint ?? "default endpoint"}`}
        >
          via {node.source.platform}
        </span>
      ) : null}
      {userSupplied ? (
        <span className="badge user-supplied" title="Resolved from manually provided content">
          user-supplied
        </span>
      ) : null}
      <ContributionBadges stats={stats} collapsed={row.hasChildren && !row.expanded} />
      {node.duplicate ? (
        <Explained
          entry={{
            ...GLOSSARY.presetDuplicate,
            plain: `${GLOSSARY.presetDuplicate.plain} Click to cycle through all ${dupCount} occurrences.`,
          }}
        >
          {(handlers) => (
            <button
              type="button"
              className="badge dup explained"
              onClick={() => onCycleDup(node)}
              {...handlers}
            >
              duplicate ×{dupCount}
            </button>
          )}
        </Explained>
      ) : null}
      {node.nested ? (
        <Explained entry={GLOSSARY.presetNested}>
          {(handlers) => (
            <span className="badge nested explained" tabIndex={0} {...handlers}>
              nested
            </span>
          )}
        </Explained>
      ) : null}
      {stateLabel ? <span className={`badge state state-${node.state}`}>{stateLabel}</span> : null}
      {node.state === "error" && node.error ? (
        <span className="preset-row-error" title={node.error.message}>
          {node.error.message}
        </span>
      ) : null}
    </div>
  );
}

/** Roadmap 011/040: the list half of the tree/detail split — the table header
 *  (when sorting applies) over the windowed row slice. Its own component since
 *  040's depth ratchet, which the windowing padding spacers pushed past. */
function PresetListPane({
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
      className={`preset-table-row${selected ? " selected" : ""}`}
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

/**
 * Replays the parent's merge loop with renovate's real mergeChildConfig to
 * get "merged config before this preset" vs "after". The engine chunk is
 * already loaded at this point, so the dynamic import (which keeps renovate
 * out of the app's initial bundle) resolves instantly.
 */
function useContribution(node: PresetNode, parent: PresetNode | undefined) {
  const merge = useEngineHelpers()?.merge ?? null;

  return useMemo(() => {
    if (!merge || !parent || node.nested || node.state !== "resolved" || !node.resolved) {
      return null;
    }
    let acc: Record<string, unknown> = {};
    for (const child of parent.children) {
      if (child.nested || child.state !== "resolved" || !child.resolved) {
        continue;
      }
      // clone: mergeChildConfig may share references with its inputs
      const resolved = structuredClone(child.resolved) as Record<string, unknown>;
      if (child.id === node.id) {
        return { before: acc, after: merge(structuredClone(acc), resolved) };
      }
      acc = merge(acc, resolved);
    }
    return null;
  }, [merge, node, parent]);
}

function SourceDetails({ node }: { node: PresetNode }) {
  const source = node.source;
  if (!source?.presetSource) {
    return null;
  }
  const rows: [string, string | undefined][] = [
    ["Source", source.presetSource],
    ["Repository", source.repo],
    ["Path", source.presetPath],
    ["Preset", source.presetName],
    ["Tag", source.tag],
    ["Parameters", source.params?.join(", ")],
    ["Platform", source.platform],
    ["Endpoint", source.endpoint],
  ];
  return (
    <dl className="preset-source">
      {rows
        .filter(([, v]) => v)
        .map(([label, v]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{v}</dd>
          </div>
        ))}
    </dl>
  );
}

function PresetInjector({
  node,
  injectionKey,
  parse,
  onInject,
}: {
  node: PresetNode;
  injectionKey: InjectionKeyFn | null;
  parse: ParseFn | null;
  onInject: (key: string, content: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const key = nodeInjectionKey(node.source, injectionKey);
  if (!key || !parse) {
    return null;
  }
  // Re-bound as consts so the narrowing above survives into `submit`: `parse`
  // is a parameter (never const-narrowed inside a closure) and `submit` was a
  // hoisted function declaration, which TS can't assume runs after the guard.
  const injectionTarget = key;
  const parseConfig = parse;

  const submit = () => {
    setError(null);
    try {
      const parsed = parseConfig(text);
      // Roadmap 030: injected preset content is user-supplied JSON that
      // flows straight into the pipeline's merges — reject an own
      // `__proto__`/`constructor`/`prototype` key anywhere in it (including
      // nested `packageRules[n]`) before it ever reaches `onInject`. Checked
      // here (the app boundary) rather than inside the engine's
      // `parseInjectedPreset`, which stays untouched.
      const pollutedAt = findPollutedPath(parsed);
      if (pollutedAt) {
        throw new Error(
          `Preset content must not contain a "${pollutedAt.at(-1)}" key (at ${pollutedAt.join(".")})`,
        );
      }
      onInject(injectionTarget, parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <details className="preset-inject" open>
      <summary>Provide preset content manually</summary>
      <p className="empty-note">
        Paste this preset&apos;s JSON (JSON5 accepted). It is stored in memory and the pipeline
        re-runs using it, so unreachable / self-hosted presets can still be explored.
      </p>
      <textarea
        className="preset-inject-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'{\n  "labels": ["from-manual-preset"]\n}'}
        rows={6}
        spellCheck={false}
      />
      {error ? <p className="preset-node-error">{error}</p> : null}
      <button
        type="button"
        className="preset-inject-button"
        onClick={submit}
        disabled={text.trim().length === 0}
      >
        Use this content &amp; re-run
      </button>
    </details>
  );
}

function PresetDetail({
  node,
  parent,
  onClose,
  injectionKey,
  parse,
  usedInjections,
  onInject,
  migrationSteps,
  authState,
  onSignIn,
  installUrl,
}: {
  node: PresetNode;
  parent: PresetNode | undefined;
  onClose: () => void;
  injectionKey: InjectionKeyFn | null;
  parse: ParseFn | null;
  usedInjections: ReadonlySet<string>;
  onInject: (key: string, content: Record<string, unknown>) => void;
  migrationSteps: TraceEvent[];
  authState: AuthState;
  onSignIn: () => void;
  installUrl: string;
}) {
  const contribution = useContribution(node, parent);
  const stateLabel = STATE_LABELS[node.state];
  const key = nodeInjectionKey(node.source, injectionKey);
  const userSupplied = key !== null && usedInjections.has(key);
  const ghFailure = githubAuthFailure(node);
  const migrationChanged =
    node.fetched !== undefined &&
    node.input !== undefined &&
    JSON.stringify(node.fetched) !== JSON.stringify(node.input);

  return (
    <div className="preset-panel">
      <div className="preset-panel-head">
        <code>{node.name}</code>
        <button type="button" className="close" onClick={onClose} aria-label="Close panel">
          ×
        </button>
      </div>
      <SourceDetails node={node} />
      {userSupplied ? (
        <p className="empty-note">
          Resolved from preset content you supplied manually rather than a fetch.
        </p>
      ) : null}
      {node.error ? <p className="preset-node-error">{node.error.message}</p> : null}
      {ghFailure.match ? (
        <GithubAuthHint
          authState={authState}
          rateLimited={ghFailure.rateLimited}
          onSignIn={onSignIn}
          installUrl={installUrl}
        />
      ) : null}
      {stateLabel && !node.error ? <p className="empty-note">{stateLabel}</p> : null}
      {node.state === "error" ? (
        <PresetInjector node={node} injectionKey={injectionKey} parse={parse} onInject={onInject} />
      ) : null}
      {node.duplicate ? (
        <p className="empty-note">
          This preset also appears elsewhere in the tree; its content was resolved once and served
          from cache here.
        </p>
      ) : null}

      {node.fetched !== undefined ? (
        <details open={!migrationChanged}>
          <summary>
            Fetched content
            <CopyMarkdownButton
              className="inline"
              header={`\`${node.name}\` — fetched preset body`}
              code={JSON.stringify(node.afterParams ?? node.fetched, null, 2)}
              lang="json"
            />
          </summary>
          <pre className="config-view">
            <ConfigJson value={node.afterParams ?? node.fetched} />
          </pre>
        </details>
      ) : null}
      {migrationChanged ? (
        <details open>
          <summary>Migration &amp; massaging applied on fetch</summary>
          <JsonDiff
            key={`${node.id}-migration`}
            before={node.afterParams ?? node.fetched}
            after={node.input}
            names={["fetched", "migrated"]}
          />
          {migrationSteps.length > 0 ? (
            <div className="preset-migration-steps">
              <div className="preset-migration-steps-title">
                Step through the {migrationSteps.length} migration
                {migrationSteps.length === 1 ? "" : "s"}
              </div>
              <MigrationSteps key={`${node.id}-steps`} steps={migrationSteps} compact />
            </div>
          ) : null}
        </details>
      ) : null}
      {node.resolved !== undefined &&
      JSON.stringify(node.resolved) !== JSON.stringify(node.input) ? (
        <details>
          <summary>
            Fully resolved (sub-presets merged)
            <CopyMarkdownButton
              className="inline"
              header={`\`${node.name}\` — fully resolved preset body`}
              code={JSON.stringify(node.resolved, null, 2)}
              lang="json"
            />
          </summary>
          <pre className="config-view">
            <ConfigJson value={node.resolved} />
          </pre>
        </details>
      ) : null}
      {contribution ? (
        <details open>
          <summary>Contribution to the merged config</summary>
          <JsonDiff
            key={`${node.id}-contribution`}
            before={contribution.before}
            after={contribution.after}
            names={["before this preset", "after this preset"]}
          />
        </details>
      ) : null}
      {node.nested ? (
        <p className="empty-note">
          Resolved inside a nested value (e.g. a packageRules entry), so it contributes to that
          value rather than the top-level merge.
        </p>
      ) : null}
    </div>
  );
}
