import { computeResolvedConfig, type ResolvedConfigMode } from "@renovate-config-debugger/engine";
import { boolOption, outputFormat, stringOption } from "../args";
import type { Command } from "../command";
import { CliError, EXIT_OK, EXIT_REFUSED } from "../io";
import { emitJson, emitLines, json, writeNotes } from "../output";
import { INPUT_OPTIONS, runFromArgs, wouldRefuse } from "../run-input";

/**
 * "Give me the equivalent config with no external references" (roadmap 051) —
 * useful as agent OUTPUT when proposing a de-preset-ified config.
 */

const MODES: readonly ResolvedConfigMode[] = ["keep-internal", "full"];

export const resolvedCommand: Command = {
  name: "resolved",
  summary: "the resolved config as a standalone document",
  usage: ["resolved [file] [--mode full|keep-internal] [--include-defaults]"],
  details: [
    "`keep-internal` (default) inlines hosted presets and keeps Renovate's",
    "own `config:*` references; `full` expands everything. Defaults may only",
    "be written into a fully expanded document — in a document that still",
    "extends presets they would merge AFTER them and override them.",
  ],
  options: [...INPUT_OPTIONS, "mode", "include-defaults", "format", "help"],
  async run(args, io) {
    const format = outputFormat(args);
    const raw = stringOption(args, "mode") ?? "keep-internal";
    const mode = MODES.find((m) => m === raw);
    if (!mode) {
      throw new CliError(`--mode must be one of ${MODES.join(", ")} (got "${raw}")`);
    }
    const includeDefaults = boolOption(args, "include-defaults");
    if (includeDefaults && mode !== "full") {
      throw new CliError("--include-defaults needs --mode full (see `rcv resolved --help`)");
    }
    const { result, notes } = await runFromArgs(args, io);
    writeNotes(io, notes);

    const output = computeResolvedConfig(result, mode, { includeDefaults });
    if (!output) {
      throw new CliError(
        "this document needs a completed preset resolution — see `rcv validate` for why it stopped",
      );
    }
    if (format === "json") {
      emitJson(io, { mode, includeDefaults, ...output });
    } else {
      const lines = [json(output.config)];
      if (output.divergingKeys.length > 0) {
        lines.push(
          "",
          `Merge-order caveat: ${output.divergingKeys.join(", ")} would resolve differently from ` +
            "this document — a kept internal preset written after an inlined preset now merges " +
            "first. Use --mode full for an exact document.",
        );
      }
      emitLines(io, lines);
    }
    return wouldRefuse(result) ? EXIT_REFUSED : EXIT_OK;
  },
};
