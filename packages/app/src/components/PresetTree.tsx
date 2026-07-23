import { memo, useEffect, useMemo, useState, type CSSProperties } from "react";
import type {
  PresetNode,
  PresetSourceRef,
  TraceEvent,
  TraceResult,
} from "@renovate-config-visualizer/engine";
import { ConfigJson } from "./ConfigJson";
import { JsonDiff } from "./JsonDiff";
import { MigrationSteps } from "./MigrationSteps";

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

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** packageRules keys whose string contents feed the search index. */
const RULE_MATCH_KEYS = [
  "matchPackageNames",
  "matchDepNames",
  "matchPackagePatterns",
  "matchPackagePrefixes",
];

/** Per-node contribution + search facts, all derived from the node's `input`. */
interface NodeStats {
  /** Top-level option keys this preset sets (excludes extends/ignorePresets/packageRules). */
  ownOptions: number;
  optionKeys: string[];
  /** packageRules entries this preset contributes itself. */
  ownRules: number;
  /** Sets no top-level option and no packageRules of its own — a pure `extends` router. */
  zero: boolean;
  /** Lowercased name/source/option-key/package-string haystack for the filter box. */
  search: string;
  depth: number;
  /** Stable structural identity (name-path from root) for expansion persistence. */
  identity: string;
  /** Descendants (excluding self). */
  descResolved: number;
  descRules: number;
  /** Descendants that are contributing or non-resolved — i.e. would render something. */
  descContrib: number;
}

interface TreeStats {
  statsById: Map<string, NodeStats>;
  nodesById: Map<string, PresetNode>;
  parents: Map<string, PresetNode>;
  identityById: Map<string, string>;
  idByIdentity: Map<string, string>;
  /** All occurrences of each preset name, in pre-order, for dedup cycling. */
  occurrencesByName: Map<string, PresetNode[]>;
  summary: TreeSummary;
}

interface TreeSummary {
  resolved: number;
  fetched: number;
  internal: number;
  options: number;
  rules: number;
  maxDepth: number;
  duplicates: number;
  errors: number;
}

function ownContribution(node: PresetNode): {
  ownOptions: number;
  optionKeys: string[];
  ownRules: number;
  search: string;
} {
  const parts: string[] = [node.name];
  const src = node.source;
  if (src) {
    for (const v of [src.presetSource, src.repo, src.presetPath, src.presetName, src.tag]) {
      if (v) {
        parts.push(v);
      }
    }
    if (src.params) {
      parts.push(...src.params);
    }
  }
  let ownOptions = 0;
  let ownRules = 0;
  const optionKeys: string[] = [];
  const input = node.input;
  if (isPlainObject(input)) {
    for (const key of Object.keys(input)) {
      if (key === "extends" || key === "ignorePresets" || key === "packageRules") {
        continue;
      }
      ownOptions++;
      optionKeys.push(key);
      parts.push(key);
    }
    const rules = input.packageRules;
    if (Array.isArray(rules)) {
      ownRules = rules.length;
      for (const rule of rules) {
        if (!isPlainObject(rule)) {
          continue;
        }
        for (const mk of RULE_MATCH_KEYS) {
          const arr = rule[mk];
          if (Array.isArray(arr)) {
            for (const s of arr) {
              if (typeof s === "string") {
                parts.push(s);
              }
            }
          }
        }
      }
    }
  }
  return { ownOptions, optionKeys, ownRules, search: parts.join(" ").toLowerCase() };
}

/** Single walk: per-node/per-subtree stats, identities, occurrences and totals. */
function computeTreeStats(root: PresetNode): TreeStats {
  const statsById = new Map<string, NodeStats>();
  const nodesById = new Map<string, PresetNode>();
  const parents = new Map<string, PresetNode>();
  const identityById = new Map<string, string>();
  const idByIdentity = new Map<string, string>();
  const occurrencesByName = new Map<string, PresetNode[]>();
  let maxDepth = 0;

  // Returns subtree aggregates INCLUDING self so the parent can roll them up.
  const visit = (
    node: PresetNode,
    identity: string,
    depth: number,
  ): { resolved: number; rules: number; contrib: number } => {
    nodesById.set(node.id, node);
    identityById.set(node.id, identity);
    if (!idByIdentity.has(identity)) {
      idByIdentity.set(identity, node.id);
    }
    if (node !== root) {
      const list = occurrencesByName.get(node.name);
      if (list) {
        list.push(node);
      } else {
        occurrencesByName.set(node.name, [node]);
      }
    }
    maxDepth = Math.max(maxDepth, depth);

    const { ownOptions, optionKeys, ownRules, search } = ownContribution(node);
    const zero = ownOptions === 0 && ownRules === 0;
    const selfResolved = node.state === "resolved" ? 1 : 0;
    const selfContrib = node.state !== "resolved" || !zero ? 1 : 0;

    let aggResolved = selfResolved;
    let aggRules = ownRules;
    let aggContrib = selfContrib;

    // Disambiguate identical-named siblings by occurrence index.
    const nameCounts = new Map<string, number>();
    for (const child of node.children) {
      const seen = nameCounts.get(child.name) ?? 0;
      nameCounts.set(child.name, seen + 1);
      const childIdentity = `${identity}>${child.name}${seen > 0 ? `#${seen}` : ""}`;
      parents.set(child.id, node);
      const sub = visit(child, childIdentity, depth + 1);
      aggResolved += sub.resolved;
      aggRules += sub.rules;
      aggContrib += sub.contrib;
    }

    statsById.set(node.id, {
      ownOptions,
      optionKeys,
      ownRules,
      zero,
      search,
      depth,
      identity,
      descResolved: aggResolved - selfResolved,
      descRules: aggRules - ownRules,
      descContrib: aggContrib - selfContrib,
    });

    return { resolved: aggResolved, rules: aggRules, contrib: aggContrib };
  };

  visit(root, "", 0);

  // Totals attributed per UNIQUE resolved preset name (duplicates served from
  // cache do not re-contribute), so the header reads as the honest cost.
  const seen = new Set<string>();
  const optionUnion = new Set<string>();
  let fetched = 0;
  let internal = 0;
  let rules = 0;
  let duplicates = 0;
  let errors = 0;
  for (const node of nodesById.values()) {
    if (node === root) {
      continue;
    }
    if (node.duplicate) {
      duplicates++;
    }
    if (node.state === "error") {
      errors++;
    }
    if (node.state !== "resolved" || seen.has(node.name)) {
      continue;
    }
    seen.add(node.name);
    const st = statsById.get(node.id);
    if (!st) {
      continue;
    }
    const kind = node.source?.presetSource ?? "internal";
    if (kind === "internal") {
      internal++;
    } else {
      fetched++;
    }
    rules += st.ownRules;
    for (const k of st.optionKeys) {
      optionUnion.add(k);
    }
  }

  return {
    statsById,
    nodesById,
    parents,
    identityById,
    idByIdentity,
    occurrencesByName,
    summary: {
      resolved: seen.size,
      fetched,
      internal,
      options: optionUnion.size,
      rules,
      maxDepth,
      duplicates,
      errors,
    },
  };
}

/**
 * Structural identity (`>`-joined name-path) of a node id in this result's
 * tree, or null. Identities are stable across re-runs of the same config, so
 * they are what a shareable link (007) stores for the selected node. Reuses the
 * same single-walk machinery the tree renders with.
 */
export function identityForNodeId(root: PresetNode, id: string): string | null {
  return computeTreeStats(root).identityById.get(id) ?? null;
}

/** The current run's node id for a stored structural identity, or null. */
export function nodeIdForIdentity(root: PresetNode, identity: string): string | null {
  return computeTreeStats(root).idByIdentity.get(identity) ?? null;
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
    void import("@renovate-config-visualizer/engine").then((engine) => {
      if (live) {
        setHelpers({
          merge: engine.mergeChildConfig as MergeFn,
          injectionKey: engine.presetInjectionKey as InjectionKeyFn,
          parse: engine.parseInjectedPreset as ParseFn,
        });
      }
    });
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
      setViewport(el.clientHeight);
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

function SummaryHeader({ summary }: { summary: TreeSummary }) {
  const bits: { label: string; value: number; title: string }[] = [
    { label: "presets", value: summary.resolved, title: "Unique presets resolved" },
    { label: "fetched", value: summary.fetched, title: "Unique presets fetched from a host" },
    { label: "internal", value: summary.internal, title: "Unique built-in presets" },
    {
      label: "options set",
      value: summary.options,
      title: "Distinct top-level options the presets set",
    },
    { label: "rules", value: summary.rules, title: "packageRules contributed by presets" },
    { label: "depth", value: summary.maxDepth, title: "Deepest extends chain" },
    {
      label: "duplicates",
      value: summary.duplicates,
      title: "Repeat occurrences served from cache",
    },
    { label: "errors", value: summary.errors, title: "Presets that failed to resolve" },
  ];
  return (
    <div className="preset-summary">
      {bits.map((b) => (
        <span key={b.label} className="preset-summary-stat" title={b.title}>
          <strong>{nf.format(b.value)}</strong> {b.label}
        </span>
      ))}
    </div>
  );
}

function ContributionBadges({ stats, collapsed }: { stats: NodeStats; collapsed: boolean }) {
  return (
    <>
      {stats.ownOptions > 0 ? (
        <span className="badge contrib opts" title="Top-level options this preset sets">
          {stats.ownOptions} opt{stats.ownOptions === 1 ? "" : "s"}
        </span>
      ) : null}
      {stats.ownRules > 0 ? (
        <span className="badge contrib rules" title="packageRules this preset contributes">
          {stats.ownRules} rule{stats.ownRules === 1 ? "" : "s"}
        </span>
      ) : null}
      {collapsed && (stats.descResolved > 0 || stats.descRules > 0) ? (
        <span className="badge rollup" title="Totals hidden inside this collapsed subtree">
          {stats.descResolved > 0 ? `· ${nf.format(stats.descResolved)} presets ` : ""}
          {stats.descRules > 0 ? `· ${nf.format(stats.descRules)} rules` : ""}
        </span>
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
      {node.source?.presetSource ? (
        <span className={`badge src src-${node.source.presetSource}`}>
          {node.source.presetSource}
        </span>
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
        <button
          type="button"
          className="badge dup"
          title={`Appears ${dupCount}× in this tree — click to cycle to the next occurrence`}
          onClick={() => onCycleDup(node)}
        >
          duplicate ×{dupCount}
        </button>
      ) : null}
      {node.nested ? (
        <span
          className="badge nested"
          title="Found while resolving a nested value (e.g. packageRules[n].extends), not this parent's own extends"
        >
          nested
        </span>
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

export const PresetTree = memo(function PresetTree({
  result,
  onInject,
  selectedId,
  onSelectNode,
}: {
  result: TraceResult;
  onInject: (key: string, content: Record<string, unknown>) => void;
  /** Controlled selection, so provenance chains (005) can select a preset node. */
  selectedId: string | null;
  onSelectNode: (id: string | null) => void;
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
        Preset resolution tree ({nf.format(stats.summary.resolved)} resolved)
      </div>
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
        <div className="preset-view-toggle" role="group" aria-label="View">
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
      <div className={`preset-tree-layout${selected ? " with-panel" : ""}`}>
        <div>
          {view === "table" ? (
            <div className="preset-table-head" role="row">
              {columns.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={`preset-th col-${c.key}${sortColumn === c.key ? " sorted" : ""}`}
                  onClick={() => toggleSort(c.key)}
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
                        onToggle={toggle}
                        onSelect={onSelectNode}
                        onCycleDup={cycleDup}
                        injectionKey={injectionKey}
                        usedInjections={usedInjections}
                        dupCount={stats.occurrencesByName.get(row.node.name)?.length ?? 1}
                      />
                    ))
                  : tableSlice.map((r) => (
                      <button
                        type="button"
                        key={r.node.id}
                        className={`preset-table-row${r.node.id === selectedId ? " selected" : ""}`}
                        style={{ height: ROW_HEIGHT }}
                        onClick={() => onSelectNode(r.node.id)}
                      >
                        <span className="col-name">{r.name}</span>
                        <span className="col-source">
                          <span className={`badge src src-${r.sourceKind}`}>{r.sourceKind}</span>
                        </span>
                        <span className="col-opts">{r.opts || ""}</span>
                        <span className="col-rules">{r.rules || ""}</span>
                        <span className="col-count">{r.count > 1 ? `×${r.count}` : ""}</span>
                      </button>
                    ))}
                <div style={{ height: win.padBottom }} />
              </>
            )}
          </div>
        </div>
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
          />
        ) : (
          <div className="preset-panel-hint">Select a preset to inspect it.</div>
        )}
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

  function submit() {
    setError(null);
    try {
      const parsed = parse!(text);
      onInject(key!, parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

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
}: {
  node: PresetNode;
  parent: PresetNode | undefined;
  onClose: () => void;
  injectionKey: InjectionKeyFn | null;
  parse: ParseFn | null;
  usedInjections: ReadonlySet<string>;
  onInject: (key: string, content: Record<string, unknown>) => void;
  migrationSteps: TraceEvent[];
}) {
  const contribution = useContribution(node, parent);
  const stateLabel = STATE_LABELS[node.state];
  const key = nodeInjectionKey(node.source, injectionKey);
  const userSupplied = key !== null && usedInjections.has(key);
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
          <summary>Fetched content</summary>
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
          <summary>Fully resolved (sub-presets merged)</summary>
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
