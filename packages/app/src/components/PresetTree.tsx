import { memo, useEffect, useMemo, useState } from "react";
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

export const PresetTree = memo(function PresetTree({
  result,
  onInject,
}: {
  result: TraceResult;
  onInject: (key: string, content: Record<string, unknown>) => void;
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
              injectionKey={injectionKey}
              usedInjections={usedInjections}
            />
          ))}
        </div>
        {selected ? (
          <PresetDetail
            node={selected}
            parent={parents.get(selected.id)}
            onClose={() => setSelectedId(null)}
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

function TreeNode({
  node,
  expanded,
  selectedId,
  onToggle,
  onSelect,
  injectionKey,
  usedInjections,
}: {
  node: PresetNode;
  expanded: ReadonlySet<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  injectionKey: InjectionKeyFn | null;
  usedInjections: ReadonlySet<string>;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const stateLabel = STATE_LABELS[node.state];
  const key = nodeInjectionKey(node.source, injectionKey);
  const userSupplied = key !== null && usedInjections.has(key);

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
              injectionKey={injectionKey}
              usedInjections={usedInjections}
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
