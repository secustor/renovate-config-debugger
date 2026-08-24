import {
  effectiveTally,
  SOURCE_FILTERS,
  type SourceFilter,
} from "@renovate-config-debugger/app/headless";
import { choiceOption, intOption } from "../args";
import { CliError } from "../io";
import { emitJson, emitLines, preview } from "../output";
import { chainStepText, entryView } from "../projections/provenance";
import {
  type RuleContribution,
  RULE_DIGEST_PLANS,
  type RuleProvenanceView,
} from "../projections/rule-provenance";
import { askProvenance } from "../questions/provenance";
import { INPUT_OPTIONS } from "../run-input";
import { defineRunCommand } from "../run-command";

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

interface ProvenanceFlags {
  ruleIndex: number | undefined;
  source: SourceFilter | undefined;
}

export const provenanceCommand = defineRunCommand<ProvenanceFlags>({
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
  prepare: (args) => ({
    ruleIndex: intOption(args, "rule", { min: 0 }),
    source: choiceOption(args, "source", SOURCE_FILTERS),
  }),
  answer({ io, format, prepared, result, rest }) {
    // One key per call, stated — a second positional used to be silently
    // dropped, which read as "the first key's chain is the whole answer".
    if (rest.length > 1) {
      throw new CliError(
        `provenance answers one key per call (got ${rest.map((k) => `"${k}"`).join(", ")}) — ` +
          "run it once per key",
      );
    }
    const answer = askProvenance(result, {
      key: rest[0],
      rule: prepared.ruleIndex,
      source: prepared.source,
      transport: "cli",
    });

    if (answer.kind === "rule") {
      if (format === "json") {
        emitJson(io, answer.view);
      } else {
        emitLines(io, [answer.view.citation, "", preview(answer.view.rule, 2_000)]);
      }
      return;
    }

    if (answer.kind === "rules") {
      // Always the richest digest here: a terminal scrolls and a script
      // indexes, and neither pays the MCP transport's byte budget.
      const view = answer.view(RULE_DIGEST_PLANS[0]);
      if (format === "json") {
        emitJson(io, view);
      } else {
        emitLines(io, rulePrettyLines(view));
      }
      return;
    }

    if (answer.kind === "key") {
      // Same note the MCP's get_provenance carries (roadmap 068): for a key a
      // packageRule can also set, this chain is the repository-wide value, not
      // the one an actual update would get. Replay-03: three CLI sessions read
      // "winner: defaults" as the effective value for a rule-covered update.
      const perDependency = answer.perDependency;
      const view = entryView(answer.entry);
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
      return;
    }

    const tally = effectiveTally(answer.entries);
    if (format === "json") {
      emitJson(io, { tally, keys: answer.shown.map(entryView) });
    } else {
      emitLines(io, [
        `${tally.keys} options set beyond the defaults, ${tally.overridden} of them overridden ` +
          `along the way (${tally.hiddenDefaults} untouched defaults not shown)`,
        "",
        ...answer.shown.map((entry) => {
          const view = entryView(entry);
          return `  ${view.key.padEnd(28)} ${view.winner ?? "?"}${view.badge ? ` [${view.badge}]` : ""}  ${preview(view.finalValue, 60)}`;
        }),
        "",
        "Ask for one key to see its full chain: rcd provenance <file> <key>",
      ]);
    }
  },
});
