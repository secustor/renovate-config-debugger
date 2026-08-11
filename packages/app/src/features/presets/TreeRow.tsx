import type { CSSProperties } from "react";
import type { PresetNode } from "@renovate-config-debugger/engine";
import type { NodeStats } from "@/components/preset-tree-stats";
import { Explained } from "@/components/glossary";
import { GLOSSARY } from "@/data/glossary-data";
import { presetTreeNameClass } from "@/lib/preset-row-dom";
import type { Row } from "./rows";
import {
  INDENT,
  type InjectionKeyFn,
  nf,
  nodeInjectionKey,
  ROW_HEIGHT,
  sourceKindEntry,
  stateBadge,
} from "./tree-shared";

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

export function TreeRow({
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
  // Roadmap 009: `failed` for every error except the two a user can act on —
  // see `stateBadge`, which owns that decision.
  const badge = stateBadge(node);
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
        // The class App's landing finds the selected node by — written through
        // the same module that spells the selector, so the two cannot drift
        // (`lib/preset-row-dom.ts`).
        className={presetTreeNameClass(node.id === selectedId)}
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
      {badge ? <span className={`badge state ${badge.className}`}>{badge.label}</span> : null}
      {node.state === "error" && node.error ? (
        <span className="preset-row-error" title={node.error.message}>
          {node.error.message}
        </span>
      ) : null}
    </div>
  );
}
