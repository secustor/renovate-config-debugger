import { outputFormat } from "../args";
import type { Command } from "../command";
import { EXIT_OK, EXIT_REFUSED } from "../io";
import { emitJson, emitLines, writeNotes } from "../output";
import { digestPayload } from "../projections/digest";
import { INPUT_OPTIONS, runFromArgs, wouldRefuse } from "../run-input";

/**
 * The Overview tab's paragraph, in a terminal — the cheapest orientation
 * before deciding what to drill into. Not a diff oracle: it narrates run-level
 * aggregates, so two runs differing only inside a `packageRules` entry read
 * the same — use `compare` for that.
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
    const payload = digestPayload(result);
    if (format === "json") {
      emitJson(io, payload);
    } else {
      emitLines(io, [payload.digest]);
    }
    return wouldRefuse(result) ? EXIT_REFUSED : EXIT_OK;
  },
};
