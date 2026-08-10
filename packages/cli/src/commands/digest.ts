import { computeProvenance } from "@renovate-config-debugger/engine";
import {
  buildDigestInput,
  buildRunDigest,
  clauseText,
  deriveRunFacts,
  digestText,
  effectiveTally,
} from "@renovate-config-debugger/app/headless";
import { outputFormat } from "../args";
import type { Command } from "../command";
import { EXIT_OK, EXIT_REFUSED } from "../io";
import { emitJson, emitLines, writeNotes } from "../output";
import { INPUT_OPTIONS, runFromArgs, wouldRefuse } from "../run-input";

/**
 * The Overview tab's paragraph, in a terminal — the cheapest orientation
 * before deciding what to drill into.
 *
 * Every number here is produced by the SAME functions the web app renders
 * (`@renovate-config-debugger/app/headless`), which is why 058 hoisted the
 * effective-config tally out of `EffectiveConfig.tsx`: a re-implementation
 * would be a second source of truth for a number the paragraph quotes.
 */
export const digestCommand: Command = {
  name: "digest",
  summary: "the run in one paragraph — start here",
  usage: ["digest [file]"],
  options: [...INPUT_OPTIONS, "format"],
  async run(args, io) {
    const format = outputFormat(args);
    const { result, notes } = await runFromArgs(args, io);
    writeNotes(io, notes);

    const facts = deriveRunFacts(result);
    const provenance = computeProvenance(result);
    const tally = provenance ? effectiveTally(provenance.values()) : null;
    const clauses = buildRunDigest(buildDigestInput(result, facts, tally));

    if (format === "json") {
      emitJson(io, {
        digest: digestText(clauses),
        clauses: clauses.map((clause) => ({
          id: clause.id,
          tone: clause.tone,
          text: clauseText(clause),
        })),
        accepted: !wouldRefuse(result),
        counts: {
          errors: facts.errorCount,
          warnings: facts.warningCount,
          rewrites: facts.migrateSteps.length,
          presets: facts.presetCount,
          effectiveOptions: tally?.keys ?? null,
          overridden: tally?.overridden ?? null,
        },
      });
    } else {
      emitLines(io, [digestText(clauses)]);
    }
    return wouldRefuse(result) ? EXIT_REFUSED : EXIT_OK;
  },
};
