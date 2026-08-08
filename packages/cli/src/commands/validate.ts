import { validatedConfigOf } from "@renovate-config-debugger/app/headless";
import { outputFormat } from "../args";
import type { Command } from "../command";
import { EXIT_OK, EXIT_REFUSED } from "../io";
import { emitJson, emitLines, writeNotes } from "../output";
import { describeMessage, type ReportedMessage } from "../projections/messages";
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
    const messages: ReportedMessage[] = [
      ...result.errors.map((m) => describeMessage(m, "error", validated, input.content)),
      ...result.warnings.map((m) => describeMessage(m, "warning", validated, input.content)),
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
