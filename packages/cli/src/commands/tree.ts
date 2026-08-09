import type { PresetNode } from "@renovate-config-debugger/engine";
import { computeTreeStats, type TreeStats } from "@renovate-config-debugger/app/headless";
import { outputFormat, stringOption } from "../args";
import type { Command } from "../command";
import { CliError, EXIT_OK, EXIT_REFUSED } from "../io";
import { emitJson, emitLines, json, writeNotes } from "../output";
import { INPUT_OPTIONS, runFromArgs, wouldRefuse } from "../run-input";

/**
 * "What did `extends` expand into, and what did preset X contribute?"
 *
 * Structure and per-node contribution stats by default, bodies behind
 * `--node` — a `config:recommended` expansion is over a thousand nodes with
 * four config bodies each, so printing them all would drown any reader,
 * human or model. Same reason the tree defaults to two levels deep.
 */

const BODIES = ["fetched", "afterParams", "input", "resolved"] as const;
type BodyKind = (typeof BODIES)[number];

interface NodeView {
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
  /** Set when children were cut by `--depth`. */
  childrenOmitted?: number;
}

function viewOf(node: PresetNode, stats: TreeStats, depthLimit: number): NodeView {
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

function treeLines(view: NodeView, out: string[]): string[] {
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
    out.push(`${indent}  … ${view.childrenOmitted} more (raise --depth, or query --node)`);
  }
  return out;
}

function parseDepth(raw: string | undefined): number {
  if (raw === undefined) {
    return 2;
  }
  if (raw === "all") {
    return Number.POSITIVE_INFINITY;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new CliError(`--depth must be a non-negative integer or "all" (got "${raw}")`);
  }
  return value;
}

function parseBody(raw: string | undefined): BodyKind | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const found = BODIES.find((b) => b === raw);
  if (!found) {
    throw new CliError(`--body must be one of ${BODIES.join(", ")} (got "${raw}")`);
  }
  return found;
}

function findNode(stats: TreeStats, query: string): PresetNode {
  const byIdentity = stats.idByIdentity.get(query);
  const node = byIdentity
    ? stats.nodesById.get(byIdentity)
    : stats.occurrencesByName.get(query)?.[0];
  if (!node) {
    throw new CliError(`--node: no preset named "${query}" in this run's tree`);
  }
  return node;
}

export const treeCommand: Command = {
  name: "tree",
  summary: "the `extends` expansion: structure, stats, and per-node bodies",
  usage: ["tree [file] [--depth <n|all>]", "tree [file] --node <name> [--body resolved]"],
  options: [...INPUT_OPTIONS, "node", "body", "depth", "format"],
  async run(args, io) {
    const format = outputFormat(args);
    const depth = parseDepth(stringOption(args, "depth"));
    const body = parseBody(stringOption(args, "body"));
    const nodeQuery = stringOption(args, "node");
    if (body && !nodeQuery) {
      throw new CliError("--body needs --node: bodies are printed one node at a time");
    }
    const { result, notes } = await runFromArgs(args, io);
    writeNotes(io, notes);
    const root = result.presetTree;
    if (!root) {
      throw new CliError("this run produced no preset tree — see `rcd validate`");
    }
    const stats = computeTreeStats(root);

    if (nodeQuery) {
      const node = findNode(stats, nodeQuery);
      const occurrences = stats.occurrencesByName.get(node.name)?.length ?? 1;
      const view = viewOf(node, stats, depth);
      if (format === "json") {
        emitJson(io, {
          node: view,
          occurrences,
          ...(body ? { body, [body]: node[body] } : {}),
        });
      } else {
        const lines = treeLines(view, []);
        if (occurrences > 1) {
          lines.push(`(${occurrences} occurrences of this preset in the tree)`);
        }
        if (body) {
          lines.push("", `${body}:`, json(node[body]));
        }
        emitLines(io, lines);
      }
      return wouldRefuse(result) ? EXIT_REFUSED : EXIT_OK;
    }

    const view = viewOf(root, stats, depth);
    if (format === "json") {
      emitJson(io, { summary: stats.summary, root: view });
    } else {
      const s = stats.summary;
      emitLines(io, [
        `${s.resolved} presets resolved (${s.internal} internal, ${s.fetched} fetched), ` +
          `${s.optionSetting} of which set options; ${s.rules} packageRules, ` +
          `max depth ${s.maxDepth}, ${s.duplicates} duplicates, ${s.errors} errors`,
        "",
        ...treeLines(view, []),
      ]);
    }
    return wouldRefuse(result) ? EXIT_REFUSED : EXIT_OK;
  },
};
