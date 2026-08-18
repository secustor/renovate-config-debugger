import { computeRuleProvenance } from "@renovate-config-debugger/engine";
import {
  effectiveTally,
  SOURCE_FILTERS,
  type SourceFilter,
} from "@renovate-config-debugger/app/headless";
import { outputFormat, type ParsedArgs, stringOption } from "../args";
import type { Command } from "../command";
import { CliError, EXIT_OK, EXIT_REFUSED } from "../io";
import { emitJson, emitLines, preview, writeNotes } from "../output";
import {
  chainStepText,
  entryView,
  perDependencyNote,
  provenanceOf,
} from "../projections/provenance";
import {
  oneRuleView,
  type RuleContribution,
  RULE_DIGEST_PLANS,
  type RuleProvenanceView,
  ruleProvenanceView,
} from "../projections/rule-provenance";
import { INPUT_OPTIONS, runFromArgs, wouldRefuse } from "../run-input";

/**
 * "Who set this key, and who overrode whom?" — the question behind most real
 * debugging sessions, and the one the web app answers with its effective-config
 * ledger.
 *
 * `packageRules` is answered by its own projection (roadmap 071): Renovate
 * concatenates that key, so "who overrode whom" is the wrong question for it
 * and the honest answer is which contiguous slice of the merged array each
 * layer contributed.
 */

function parseRuleIndex(args: ParsedArgs): number | undefined {
  const raw = stringOption(args, "rule");
  if (raw === undefined) {
    return undefined;
  }
  const index = Number(raw);
  if (!Number.isInteger(index) || index < 0) {
    throw new CliError(`--rule takes a merged rule index, 0 or greater (got "${raw}")`);
  }
  return index;
}

function parseSource(args: ParsedArgs): SourceFilter | undefined {
  const raw = stringOption(args, "source");
  if (raw === undefined) {
    return undefined;
  }
  const found = SOURCE_FILTERS.find((value) => value === raw);
  if (!found) {
    throw new CliError(`--source must be one of ${SOURCE_FILTERS.join("|")} (got "${raw}")`);
  }
  return found;
}

/** `repo — merged packageRules[1]–[3] (its own packageRules[0]–[2])`. */
function contributionHeader(contribution: RuleContribution): string {
  const own = `${contribution.layer === "repo" ? "your" : "its own"} packageRules[0]–[${
    contribution.count - 1
  }]`;
  return (
    `  ${contribution.layer} — merged packageRules[${contribution.from}]–` +
    `[${contribution.to}] (${own})`
  );
}

function rulePrettyLines(view: RuleProvenanceView): string[] {
  const lines = [
    `packageRules${view.badge ? ` [${view.badge}]` : ""} — ${view.total} merged rules, ` +
      "concatenated: every layer appends, none overrides",
    "",
  ];
  for (const contribution of view.contributions ?? []) {
    lines.push(contributionHeader(contribution));
    for (const rule of contribution.rules ?? []) {
      lines.push(`    ${rule}`);
    }
  }
  if (view.attributionNote) {
    lines.push(`  ${view.attributionNote}`);
  }
  lines.push("", view.note);
  return lines;
}

export const provenanceCommand: Command = {
  name: "provenance",
  summary: "per-key provenance: which layer set each option, and who overrode whom",
  usage: ["provenance [file] [key]"],
  details: [
    "Without a key: every option some layer beyond the defaults set.",
    "With a key: that option's full override chain.",
    "",
    "`packageRules` answers with one merged-index RANGE per contributing",
    "layer plus a one-line digest of each rule — Renovate concatenates that",
    "key, so no layer overrides another. `--source repo|presets` scopes the",
    "ranges and `--rule <n>` prints one merged rule's body, its layer and its",
    "index inside that layer.",
  ],
  options: [...INPUT_OPTIONS, "rule", "source", "format"],
  async run(args, io) {
    const format = outputFormat(args);
    const ruleIndex = parseRuleIndex(args);
    const source = parseSource(args);
    const { result, rest, notes } = await runFromArgs(args, io);
    writeNotes(io, notes);
    // One key per call, stated — a second positional used to be silently
    // dropped, which read as "the first key's chain is the whole answer".
    if (rest.length > 1) {
      throw new CliError(
        `provenance answers one key per call (got ${rest.map((k) => `"${k}"`).join(", ")}) — ` +
          "run it once per key",
      );
    }
    const key = rest[0];

    const provenance = provenanceOf(result);
    const tally = effectiveTally(provenance.values());
    const entries = [...provenance.values()];

    if (key) {
      const entry = provenance.get(key);
      if (!entry) {
        throw new CliError(`no key "${key}" in the effective config`);
      }
      if (key !== "packageRules" && (ruleIndex !== undefined || source !== undefined)) {
        throw new CliError(
          `--rule/--source scope the merged packageRules; "${key}" is not an array of rules`,
        );
      }
      if (key === "packageRules") {
        const attribution = computeRuleProvenance(result);
        const rules = Array.isArray(result.finalConfig?.packageRules)
          ? result.finalConfig.packageRules
          : [];
        if (ruleIndex !== undefined) {
          const one = oneRuleView(ruleIndex, attribution, rules);
          if (format === "json") {
            emitJson(io, one);
          } else {
            emitLines(io, [one.citation, "", preview(one.rule, 2_000)]);
          }
          return wouldRefuse(result) ? EXIT_REFUSED : EXIT_OK;
        }
        // Always the richest digest here: a terminal scrolls and a script
        // indexes, and neither pays the MCP transport's byte budget.
        const view = ruleProvenanceView(
          entry,
          attribution,
          rules,
          RULE_DIGEST_PLANS[0],
          source ? { source } : {},
        );
        if (format === "json") {
          emitJson(io, view);
        } else {
          emitLines(io, rulePrettyLines(view));
        }
        return wouldRefuse(result) ? EXIT_REFUSED : EXIT_OK;
      }
      // Same note the MCP's get_provenance carries (roadmap 068): for a key a
      // packageRule can also set, this chain is the repository-wide value, not
      // the one an actual update would get. Replay-03: three CLI sessions read
      // "winner: defaults" as the effective value for a rule-covered update.
      const perDependency = perDependencyNote(key, result.finalConfig);
      const view = entryView(entry);
      if (format === "json") {
        emitJson(io, { ...view, ...(perDependency ? { note: perDependency } : {}) });
      } else {
        emitLines(io, [
          `${view.key}${view.badge ? ` [${view.badge}]` : ""} — winner: ${view.winner ?? "?"}`,
          `  final: ${preview(view.finalValue, 400)}`,
          "",
          "Override chain:",
          ...view.chain.map((step) => `  ${step.layer} ${step.action} ${chainStepText(step)}`),
          ...(perDependency ? ["", perDependency] : []),
        ]);
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
