import type { PresetNode, TraceResult } from "@renovate-config-debugger/engine";
import { computeTreeStats, type TreeStats } from "@renovate-config-debugger/app/headless";
import { CliError } from "../io";

/**
 * The preset tree, projected. Shared by `rcv tree` and the MCP server's
 * `get_preset_tree`/`get_preset_node` (roadmap 060), so the two answer the
 * same question with the same shape — the CLI and the MCP server are one
 * surface with two transports, not two implementations.
 *
 * The projection exists because the raw tree is unusable as an answer: a
 * `config:recommended` expansion is over a thousand nodes carrying four config
 * bodies each. Structure and contribution stats by default; bodies one node at
 * a time.
 */

export const BODIES = ["fetched", "afterParams", "input", "resolved"] as const;
export type BodyKind = (typeof BODIES)[number];

export const DEFAULT_TREE_DEPTH = 2;

export interface NodeView {
  name: string;
  identity: string;
  state: string;
  depth: number;
  source?: string;
  duplicate?: true;
  nested?: true;
  error?: string;
  ownOptions: number;
  optionKeys: string[];
  ownRules: number;
  descendants: { resolved: number; rules: number };
  children?: NodeView[];
  /** Set when children were cut by the depth limit. */
  childrenOmitted?: number;
}

export function viewOf(node: PresetNode, stats: TreeStats, depthLimit: number): NodeView {
  const st = stats.statsById.get(node.id);
  const view: NodeView = {
    name: node.name,
    identity: stats.identityById.get(node.id) ?? "",
    state: node.state,
    depth: st?.depth ?? 0,
    ...(node.source?.presetSource ? { source: node.source.presetSource } : {}),
    ...(node.duplicate ? { duplicate: true as const } : {}),
    ...(node.nested ? { nested: true as const } : {}),
    ...(node.error ? { error: `${node.error.topic}: ${node.error.message}` } : {}),
    ownOptions: st?.ownOptions ?? 0,
    optionKeys: st?.optionKeys ?? [],
    ownRules: st?.ownRules ?? 0,
    descendants: { resolved: st?.descResolved ?? 0, rules: st?.descRules ?? 0 },
  };
  if (node.children.length === 0) {
    return view;
  }
  if ((st?.depth ?? 0) >= depthLimit) {
    return { ...view, childrenOmitted: node.children.length };
  }
  return { ...view, children: node.children.map((c) => viewOf(c, stats, depthLimit)) };
}

/** Indented one-line-per-node rendering of a {@link NodeView}. */
export function treeLines(view: NodeView, out: string[]): string[] {
  const indent = "  ".repeat(view.depth);
  const facts = [
    view.state === "resolved" ? null : view.state,
    view.ownOptions > 0 ? `${view.ownOptions} option(s): ${view.optionKeys.join(", ")}` : null,
    view.ownRules > 0 ? `${view.ownRules} rule(s)` : null,
    view.descendants.resolved > 0 ? `+${view.descendants.resolved} below` : null,
    view.duplicate ? "duplicate" : null,
    view.error,
  ].filter((part) => part !== null && part !== undefined);
  out.push(`${indent}${view.name}${facts.length > 0 ? `  — ${facts.join("; ")}` : ""}`);
  for (const child of view.children ?? []) {
    treeLines(child, out);
  }
  if (view.childrenOmitted) {
    out.push(`${indent}  … ${view.childrenOmitted} more (raise the depth, or query one node)`);
  }
  return out;
}

export function parseBody(raw: string | undefined): BodyKind | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const found = BODIES.find((b) => b === raw);
  if (!found) {
    throw new CliError(`body must be one of ${BODIES.join(", ")} (got "${raw}")`);
  }
  return found;
}

/** The run's tree root + stats, or a legible error when it produced no tree. */
export function treeStatsOf(result: TraceResult): { root: PresetNode; stats: TreeStats } {
  const root = result.presetTree;
  if (!root) {
    throw new CliError("this run produced no preset tree — validate the config first");
  }
  return { root, stats: computeTreeStats(root) };
}

/** A node by structural identity (`a>b>c`) or by preset name. */
export function findNode(stats: TreeStats, query: string): PresetNode {
  const byIdentity = stats.idByIdentity.get(query);
  const node = byIdentity
    ? stats.nodesById.get(byIdentity)
    : stats.occurrencesByName.get(query)?.[0];
  if (!node) {
    throw new CliError(`no preset named "${query}" in this run's tree`);
  }
  return node;
}

/** Flat name+identity list of the nodes whose name matches `query`. */
export function searchNodes(
  stats: TreeStats,
  query: string,
): { name: string; identity: string; state: string; ownOptions: number; ownRules: number }[] {
  const needle = query.toLowerCase();
  const found: ReturnType<typeof searchNodes> = [];
  for (const [id, node] of stats.nodesById) {
    if (!node.name.toLowerCase().includes(needle)) {
      continue;
    }
    const st = stats.statsById.get(id);
    found.push({
      name: node.name,
      identity: stats.identityById.get(id) ?? "",
      state: node.state,
      ownOptions: st?.ownOptions ?? 0,
      ownRules: st?.ownRules ?? 0,
    });
  }
  return found;
}
