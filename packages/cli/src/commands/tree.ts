import { jsonDocument } from "@renovate-config-debugger/engine/json";
import { intOption, type ParsedArgs, stringOption } from "../args";
import { CliError } from "../io";
import { emitJson, emitLines } from "../output";
import {
  type BodyKind,
  bodyOf,
  DEFAULT_TREE_DEPTH,
  findNode,
  parseBody,
  treeLines,
  treeStatsOf,
  viewOf,
} from "../projections/tree";
import { INPUT_OPTIONS } from "../run-input";
import { defineRunCommand } from "../run-command";

/**
 * "What did `extends` expand into, and what did preset X contribute?"
 *
 * Structure and per-node contribution stats by default, bodies behind
 * `--node` — a `config:recommended` expansion is over a thousand nodes with
 * four config bodies each, so printing them all would drown any reader,
 * human or model. Same reason the tree defaults to two levels deep.
 */

/** `--depth <n|all>` — the one spelling that is not a number is the whole
 *  tree, so it is read before the integer reader ever sees it. */
function parseDepth(args: ParsedArgs): number {
  if (stringOption(args, "depth") === "all") {
    return Number.POSITIVE_INFINITY;
  }
  return intOption(args, "depth", { min: 0, or: '"all"' }) ?? DEFAULT_TREE_DEPTH;
}

interface TreeFlags {
  depth: number;
  body: BodyKind | undefined;
  nodeQuery: string | undefined;
}

export const treeCommand = defineRunCommand<TreeFlags>({
  name: "tree",
  summary: "the `extends` expansion: structure, stats, and per-node bodies",
  usage: [
    "tree [file] [--depth <n|all>]",
    "tree [file] --node <name> [--body resolved] [--depth <n|all>]",
  ],
  options: [...INPUT_OPTIONS, "node", "body", "depth", "format"],
  prepare(args) {
    const depth = parseDepth(args);
    const body = parseBody(stringOption(args, "body"));
    const nodeQuery = stringOption(args, "node");
    if (body && !nodeQuery) {
      throw new CliError("--body needs --node: bodies are printed one node at a time");
    }
    return { depth, body, nodeQuery };
  },
  answer({ io, format, prepared, result }) {
    const { depth, body, nodeQuery } = prepared;
    const { root, stats } = treeStatsOf(result);

    if (nodeQuery) {
      const node = findNode(stats, nodeQuery);
      const occurrences = stats.occurrencesByName.get(node.name)?.length ?? 1;
      // `viewOf` cuts on ABSOLUTE depth, so a queried node needs its own depth
      // added or `--depth` would report zero children for anything deep enough.
      const nodeDepth = stats.statsById.get(node.id)?.depth ?? 0;
      const view = viewOf(node, stats, nodeDepth + depth);
      const shown = body ? bodyOf(node, body) : undefined;
      if (format === "json") {
        emitJson(io, { node: view, occurrences, ...shown });
      } else {
        const lines = treeLines(view, []);
        if (occurrences > 1) {
          lines.push(`(${occurrences} occurrences of this preset in the tree)`);
        }
        if (shown) {
          lines.push("", `${shown.body}:`, shown.note ?? jsonDocument(shown[shown.body]));
        }
        emitLines(io, lines);
      }
      return;
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
  },
});
