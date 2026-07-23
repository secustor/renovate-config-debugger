import { memo, useEffect, useMemo, useState } from "react";
import type { PresetNode, TraceResult } from "@renovate-config-visualizer/engine";
import { ConfigJson } from "./ConfigJson";
import { JsonDiff } from "./JsonDiff";

/**
 * Roadmap 002: interactive tree of the recursive `extends` expansion. One
 * node per preset in resolution order; clicking a node opens a panel with the
 * fetched/migrated/resolved content and this preset's contribution to the
 * merged config. Subtrees are collapsed by default so config:recommended's
 * ~1000 nodes never hit the DOM at once.
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

/** Unique resolved presets (duplicates via multiple paths count once). */
function countResolvedPresets(root: PresetNode): number {
  const names = new Set<string>();
  const walk = (node: PresetNode) => {
    if (node !== root && node.state === "resolved") {
      names.add(node.name);
    }
    node.children.forEach(walk);
  };
  walk(root);
  return names.size;
}

function buildParents(root: PresetNode): Map<string, PresetNode> {
  const parents = new Map<string, PresetNode>();
  const walk = (node: PresetNode) => {
    for (const child of node.children) {
      parents.set(child.id, node);
      walk(child);
    }
  };
  walk(root);
  return parents;
}

export const PresetTree = memo(function PresetTree({ result }: { result: TraceResult }) {
  const root = result.presetTree;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // node ids restart at p1 for every run, so state from a previous result
  // would silently map onto unrelated nodes of the new tree
  useEffect(() => {
    setExpanded(new Set());
    setSelectedId(null);
  }, [root]);

  const parents = useMemo(
    () => (root ? buildParents(root) : new Map<string, PresetNode>()),
    [root],
  );
  const nodesById = useMemo(() => {
    const map = new Map<string, PresetNode>();
    const walk = (node: PresetNode) => {
      map.set(node.id, node);
      node.children.forEach(walk);
    };
    if (root) {
      walk(root);
    }
    return map;
  }, [root]);

  if (!root || root.children.length === 0) {
    return null;
  }
  const selected = selectedId ? nodesById.get(selectedId) : undefined;

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="card">
      <div className="card-title">
        Preset resolution tree ({countResolvedPresets(root)} resolved)
      </div>
      <div className={`preset-tree-layout${selected ? " with-panel" : ""}`}>
        <div className="preset-tree" role="tree">
          {root.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              expanded={expanded}
              selectedId={selectedId}
              onToggle={toggle}
              onSelect={setSelectedId}
            />
          ))}
        </div>
        {selected ? (
          <PresetDetail
            node={selected}
            parent={parents.get(selected.id)}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <div className="preset-panel-hint">Select a preset to inspect it.</div>
        )}
      </div>
    </div>
  );
});

function TreeNode({
  node,
  expanded,
  selectedId,
  onToggle,
  onSelect,
}: {
  node: PresetNode;
  expanded: ReadonlySet<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const stateLabel = STATE_LABELS[node.state];

  return (
    <div
      className="preset-node"
      role="treeitem"
      aria-expanded={hasChildren ? isExpanded : undefined}
    >
      <div className={`preset-row state-${node.state}`}>
        {hasChildren ? (
          <button type="button" className="caret" onClick={() => onToggle(node.id)}>
            {isExpanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="caret-spacer" />
        )}
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
        {hasChildren && !isExpanded ? (
          <span className="badge count">{node.children.length}</span>
        ) : null}
        {node.duplicate ? (
          <span
            className="badge dup"
            title="The same preset is also resolved elsewhere in this tree"
          >
            duplicate
          </span>
        ) : null}
        {node.nested ? (
          <span
            className="badge nested"
            title="Found while resolving a nested value (e.g. packageRules[n].extends), not this parent's own extends"
          >
            nested
          </span>
        ) : null}
        {stateLabel ? (
          <span className={`badge state state-${node.state}`}>{stateLabel}</span>
        ) : null}
      </div>
      {node.state === "error" && node.error ? (
        <div className="preset-node-error">{node.error.message}</div>
      ) : null}
      {hasChildren && isExpanded ? (
        <div className="preset-children" role="group">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              expanded={expanded}
              selectedId={selectedId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Replays the parent's merge loop with renovate's real mergeChildConfig to
 * get "merged config before this preset" vs "after". The engine chunk is
 * already loaded at this point, so the dynamic import (which keeps renovate
 * out of the app's initial bundle) resolves instantly.
 */
function useContribution(node: PresetNode, parent: PresetNode | undefined) {
  const [merge, setMerge] = useState<MergeFn | null>(null);

  useEffect(() => {
    let live = true;
    void import("@renovate-config-visualizer/engine").then((engine) => {
      if (live) {
        setMerge(() => engine.mergeChildConfig as MergeFn);
      }
    });
    return () => {
      live = false;
    };
  }, []);

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

function PresetDetail({
  node,
  parent,
  onClose,
}: {
  node: PresetNode;
  parent: PresetNode | undefined;
  onClose: () => void;
}) {
  const contribution = useContribution(node, parent);
  const stateLabel = STATE_LABELS[node.state];
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
      {node.error ? <p className="preset-node-error">{node.error.message}</p> : null}
      {stateLabel && !node.error ? <p className="empty-note">{stateLabel}</p> : null}
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
