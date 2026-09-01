import type { ResolvedConfigMode } from "@renovate-config-debugger/engine";
import { jsonDocument } from "@renovate-config-debugger/engine/json";
import { boolOption, choiceOption } from "../args";
import { emitJson, emitLines } from "../output";
import { askResolved } from "../questions/resolved";
import { INPUT_OPTIONS } from "../run-input";
import { defineRunCommand } from "../run-command";

/**
 * "Give me the equivalent config with no external references" (roadmap 051) —
 * useful as agent OUTPUT when proposing a de-preset-ified config.
 */

const MODES: readonly ResolvedConfigMode[] = ["keep-internal", "full"];

interface ResolvedFlags {
  mode: ResolvedConfigMode;
  includeDefaults: boolean;
}

export const resolvedCommand = defineRunCommand<ResolvedFlags>({
  name: "resolved",
  summary: "the resolved config as a standalone document",
  usage: ["resolved [file] [--mode full|keep-internal] [--include-defaults]"],
  details: [
    "`keep-internal` (default) inlines hosted presets and keeps Renovate's",
    "own `config:*` references; `full` expands everything. Defaults may only",
    "be written into a fully expanded document — in a document that still",
    "extends presets they would merge AFTER them and override them.",
  ],
  options: [...INPUT_OPTIONS, "mode", "include-defaults", "format"],
  prepare: (args) => ({
    mode: choiceOption(args, "mode", MODES) ?? "keep-internal",
    includeDefaults: boolOption(args, "include-defaults"),
  }),
  answer({ io, format, prepared, result }) {
    const { mode, includeDefaults, output } = askResolved(result, {
      ...prepared,
      transport: "cli",
    });
    if (format === "json") {
      emitJson(io, { mode, includeDefaults, ...output });
    } else {
      const lines = [jsonDocument(output.config)];
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
  },
});
