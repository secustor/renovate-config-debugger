import { intOption, outputFormat, type ParsedArgs, stringOption } from "../args";
import type { Command } from "../command";
import { CliError, EXIT_OK, EXIT_REFUSED } from "../io";
import { emitJson, emitLines, json, writeNotes } from "../output";
import {
  DEFAULT_TREE_DEPTH,
  findNode,
  parseBody,
  treeLines,
  treeStatsOf,
  viewOf,
} from "../projections/tree";
import { INPUT_OPTIONS, runFromArgs, wouldRefuse } from "../run-input";

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

export const treeCommand: Command = {
  name: "tree",
  summary: "the `extends` expansion: structure, stats, and per-node bodies",
  usage: ["tree [file] [--depth <n|all>]", "tree [file] --node <name> [--body resolved]"],
  options: [...INPUT_OPTIONS, "node", "body", "depth", "format"],
  async run(args, io) {
    const format = outputFormat(args);
    const depth = parseDepth(args);
    const body = parseBody(stringOption(args, "body"));
    const nodeQuery = stringOption(args, "node");
    if (body && !nodeQuery) {
      throw new CliError("--body needs --node: bodies are printed one node at a time");
    }
    const { result, notes } = await runFromArgs(args, io);
    writeNotes(io, notes);
    const { root, stats } = treeStatsOf(result);

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
