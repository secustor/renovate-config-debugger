import { computeRuleProvenance } from "@renovate-config-debugger/engine";
import { effectiveTally } from "@renovate-config-debugger/app/headless";
import { outputFormat } from "../args";
import type { Command } from "../command";
import { CliError, EXIT_OK, EXIT_REFUSED } from "../io";
import { emitJson, emitLines, preview, writeNotes } from "../output";
import { entryView, layerLabel, provenanceOf } from "../projections/provenance";
import { INPUT_OPTIONS, runFromArgs, wouldRefuse } from "../run-input";

/**
 * "Who set this key, and who overrode whom?" — the question behind most real
 * debugging sessions, and the one the web app answers with its effective-config
 * ledger.
 */
export const provenanceCommand: Command = {
  name: "provenance",
  summary: "per-key provenance: which layer set each option, and who overrode whom",
  usage: ["provenance [file] [key]"],
  details: [
    "Without a key: every option some layer beyond the defaults set.",
    "With a key: that option's full override chain, plus — for",
    "`packageRules` — which layer contributed each merged rule.",
  ],
  options: [...INPUT_OPTIONS, "format", "help"],
  async run(args, io) {
    const format = outputFormat(args);
    const { result, rest, notes } = await runFromArgs(args, io);
    writeNotes(io, notes);
    const key = rest[0];

    const provenance = provenanceOf(result);
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
        "Ask for one key to see its full chain: rcv provenance <file> <key>",
      ]);
    }
    return wouldRefuse(result) ? EXIT_REFUSED : EXIT_OK;
  },
};
