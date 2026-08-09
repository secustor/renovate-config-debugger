import {
  computeProvenance,
  computeRuleProvenance,
  type KeyProvenance,
  type ProvenanceLayer,
} from "@renovate-config-debugger/engine";
import {
  effectiveTally,
  isOverridden,
  multiContribBadgeKind,
} from "@renovate-config-debugger/app/headless";
import { outputFormat } from "../args";
import type { Command } from "../command";
import { CliError, EXIT_OK, EXIT_REFUSED } from "../io";
import { emitJson, emitLines, preview, writeNotes } from "../output";
import { INPUT_OPTIONS, runFromArgs, wouldRefuse } from "../run-input";

/**
 * "Who set this key, and who overrode whom?" — the question behind most real
 * debugging sessions, and the one the web app answers with its effective-config
 * ledger. Same computation (`computeProvenance`), same badges: 016 established
 * that calling an appended array "overridden" is misleading, so the label
 * comes from `multiContribBadgeKind` rather than from "more than one layer
 * touched it".
 */

function layerLabel(layer: ProvenanceLayer): string {
  return layer.kind === "preset" ? `preset ${layer.name}` : layer.kind;
}

function entryView(entry: KeyProvenance) {
  const winner = entry.chain.findLast((s) => !s.noop) ?? entry.chain.at(-1);
  return {
    key: entry.key,
    finalValue: entry.finalValue,
    isDefaultOnly: entry.isDefaultOnly,
    winner: winner ? layerLabel(winner.layer) : null,
    badge: isOverridden(entry) ? multiContribBadgeKind(entry) : null,
    chain: entry.chain
      .filter((step) => !step.noop)
      .map((step) => ({
        layer: layerLabel(step.layer),
        action: step.action,
        before: step.before,
        after: step.after,
        ...(step.expandedNested ? { expandedNested: true } : {}),
      })),
  };
}

export const provenanceCommand: Command = {
  name: "provenance",
  summary: "per-key provenance: which layer set each option, and who overrode whom",
  usage: ["provenance [file] [key]"],
  details: [
    "Without a key: every option some layer beyond the defaults set.",
    "With a key: that option's full override chain, plus — for",
    "`packageRules` — which layer contributed each merged rule.",
  ],
  options: [...INPUT_OPTIONS, "format"],
  async run(args, io) {
    const format = outputFormat(args);
    const { result, rest, notes } = await runFromArgs(args, io);
    writeNotes(io, notes);
    const key = rest[0];

    const provenance = computeProvenance(result);
    if (!provenance) {
      throw new CliError(
        "provenance needs a completed preset resolution — see `rcd validate` for why it stopped",
      );
    }
    const tally = effectiveTally(provenance.values());
    const entries = [...provenance.values()];

    if (key) {
      const entry = provenance.get(key);
      if (!entry) {
        throw new CliError(`no key "${key}" in the effective config`);
      }
      const rules =
        key === "packageRules"
          ? (computeRuleProvenance(result) ?? []).map((attr) => ({
              index: attr.index,
              layer: layerLabel(attr.layer),
            }))
          : [];
      if (format === "json") {
        emitJson(io, { ...entryView(entry), ...(rules.length > 0 ? { rules } : {}) });
      } else {
        const view = entryView(entry);
        const lines = [
          `${view.key}${view.badge ? ` [${view.badge}]` : ""} — winner: ${view.winner ?? "?"}`,
          `  final: ${preview(view.finalValue, 400)}`,
          "",
          "Override chain:",
          ...view.chain.map((step) => `  ${step.layer} ${step.action} ${preview(step.after)}`),
        ];
        if (rules.length > 0) {
          lines.push(
            "",
            "packageRules by layer:",
            ...rules.map((r) => `  #${r.index + 1} ${r.layer}`),
          );
        }
        emitLines(io, lines);
      }
      return wouldRefuse(result) ? EXIT_REFUSED : EXIT_OK;
    }

    const shown = entries.filter((entry) => !entry.isDefaultOnly);
    if (format === "json") {
      emitJson(io, { tally, keys: shown.map(entryView) });
    } else {
      emitLines(io, [
        `${tally.keys} options set beyond the defaults, ${tally.overridden} of them overridden ` +
          `along the way (${tally.hiddenDefaults} untouched defaults not shown)`,
        "",
        ...shown.map((entry) => {
          const view = entryView(entry);
          return `  ${view.key.padEnd(28)} ${view.winner ?? "?"}${view.badge ? ` [${view.badge}]` : ""}  ${preview(view.finalValue, 60)}`;
        }),
        "",
        "Ask for one key to see its full chain: rcd provenance <file> <key>",
      ]);
    }
    return wouldRefuse(result) ? EXIT_REFUSED : EXIT_OK;
  },
};
