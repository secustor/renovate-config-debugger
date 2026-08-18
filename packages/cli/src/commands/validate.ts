import { computeRuleProvenance, type ValidationMessage } from "@renovate-config-debugger/engine";
import { validatedConfigOf } from "@renovate-config-debugger/app/headless";
import { outputFormat } from "../args";
import type { Command } from "../command";
import { EXIT_OK, EXIT_REFUSED } from "../io";
import { emitJson, emitLines, writeNotes } from "../output";
import {
  describeMessage,
  type MessageSeverity,
  type ReportedMessage,
  repoStageMessage,
  ruleCrossLink,
} from "../projections/messages";
import { INPUT_OPTIONS, runFromArgs, wouldRefuse } from "../run-input";

/**
 * "Would Renovate accept this?" — the most automatable question, and the one
 * with hook-grade exit codes.
 *
 * It sees more than `renovate-config-validator` does: the run continues
 * through preset resolution, so unresolvable or erroring presets surface as
 * well, and each message carries 014's translation, docs link and suggested
 * fix. The fix is reported, never applied: agents edit configs with their own
 * tools and come back to `validate`/`compare` as the oracle.
 */

export const validateCommand: Command = {
  name: "validate",
  summary: "would Renovate accept this config? (exit 2 if not)",
  usage: ["validate [file]"],
  details: [
    "Exit 0 = accepted, 2 = Renovate would refuse it, 1 = the run itself",
    "failed. Exit 2 is what Claude Code hooks read as the blocking signal,",
    "so this drops into a Stop/PreToolUse hook without a wrapper.",
  ],
  options: [...INPUT_OPTIONS, "format"],
  async run(args, io) {
    const format = outputFormat(args);
    const { result, input, notes } = await runFromArgs(args, io);
    writeNotes(io, notes);

    // The snapshot the validator's messages were produced from, so a fix's
    // path resolves against the same document (`packageRules[N]` included).
    const validated = validatedConfigOf(result);
    // The `packageRules[N]` in a validator message is the index in the config
    // as WRITTEN; `simulate` and `provenance` cite the merged one. Only for
    // messages the validate stage produced — the global and inherited layers
    // file theirs in the same arrays, against a different document.
    const attribution = computeRuleProvenance(result);
    const describe = (m: ValidationMessage, severity: MessageSeverity): ReportedMessage =>
      describeMessage(
        m,
        severity,
        validated,
        input.content,
        repoStageMessage(result, m) ? ruleCrossLink(m, "repo", attribution) : undefined,
      );
    const messages: ReportedMessage[] = [
      ...result.errors.map((m) => describe(m, "error")),
      ...result.warnings.map((m) => describe(m, "warning")),
    ];
    const presetErrors = result.events.filter((e) => e.kind === "preset-error").map((e) => e.title);
    const refused = wouldRefuse(result);

    if (format === "json") {
      emitJson(io, {
        accepted: !refused,
        renovateVersion: result.renovateVersion,
        stageStatus: result.stageStatus,
        messages,
        presetErrors,
      });
    } else {
      const lines: string[] = [
        refused
          ? "✗ Renovate would REFUSE this config."
          : messages.length === 0 && presetErrors.length === 0
            ? "✓ Renovate accepted this config."
            : "✓ Renovate accepted every option in this config, with remarks.",
      ];
      for (const m of messages) {
        lines.push("", `${m.severity === "error" ? "✗" : "!"} ${m.topic}: ${m.message}`);
        if (m.rule) {
          lines.push(`    ${m.rule.note}`);
        }
        if (m.explanation) {
          lines.push(`    ${m.explanation}`);
        }
        if (m.fix) {
          lines.push(`    fix: ${m.fix.summary}`);
        }
        if (m.docsUrl) {
          lines.push(`    docs: ${m.docsUrl}`);
        }
      }
      for (const title of presetErrors) {
        lines.push("", `✗ ${title}`);
      }
      emitLines(io, lines);
    }
    return refused ? EXIT_REFUSED : EXIT_OK;
  },
};
