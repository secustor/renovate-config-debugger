import { compareSimulations } from "@renovate-config-debugger/engine";
import { outputFormat, stringOption } from "../args";
import type { Command } from "../command";
import { EXIT_OK, EXIT_REFUSED } from "../io";
import { emitJson, emitLines, preview, writeNotes } from "../output";
import { INPUT_OPTIONS, runOne, takeInputFile, wouldRefuse } from "../run-input";
import { readDependency } from "../dep";
import { simulateAgainst } from "./simulate";

/**
 * Roadmap 018's A/B oracle, and the reason the debugger can stay read-only:
 * an agent edits a config with its own tools, then PROVES the edit changes
 * (or doesn't change) behavior before opening a PR.
 *
 * Two shapes, both "A versus B, one thing varied":
 * - two config files, one dependency — did my edit change the outcome?
 * - one config, two dependencies — does this config treat them differently?
 */
export const compareCommand: Command = {
  name: "compare",
  summary: "A/B two simulations: prove an edit changed (or didn't change) behavior",
  usage: [
    `compare <before.json> <after.json> --dep '{"depName":"react"}'`,
    `compare <file> --dep '{…}' --dep-b '{…}'`,
  ],
  options: [...INPUT_OPTIONS, "dep", "dep-file", "dep-b", "dep-b-file", "format", "help"],
  async run(args, io) {
    const format = outputFormat(args);
    const { file, rest } = takeInputFile(args);
    const fileB = rest[0];
    const depA = await readDependency(args, "dep", "dep-file");
    const twoDeps = Boolean(stringOption(args, "dep-b") ?? stringOption(args, "dep-b-file"));
    const depB = twoDeps ? await readDependency(args, "dep-b", "dep-b-file") : depA;

    const a = await runOne(args, io, file);
    writeNotes(io, a.notes);
    const b = fileB ? await runOne(args, io, fileB) : a;
    if (fileB) {
      writeNotes(io, b.notes);
    }

    const simA = await simulateAgainst(a.result, depA);
    const simB = await simulateAgainst(b.result, depB);
    const comparison = compareSimulations(simA, simB);

    if (format === "json") {
      emitJson(io, {
        a: { config: file ?? "(stdin/repo)", dep: depA },
        b: { config: fileB ?? file ?? "(stdin/repo)", dep: depB },
        ...comparison,
      });
    } else {
      emitLines(io, [
        comparison.noChange
          ? "✓ No behavioral change: the same rules matched and the resulting config is identical."
          : "Behavior differs between A and B.",
        ...(comparison.matchedOnlyInA.length > 0
          ? ["", "Matched only in A:", ...comparison.matchedOnlyInA.map((r) => `  ${r.label}`)]
          : []),
        ...(comparison.matchedOnlyInB.length > 0
          ? ["", "Matched only in B:", ...comparison.matchedOnlyInB.map((r) => `  ${r.label}`)]
          : []),
        ...(comparison.configDelta.length > 0
          ? [
              "",
              "Config delta:",
              ...comparison.configDelta.map(
                (d) => `  ${d.key}: ${preview(d.before)} → ${preview(d.after)}`,
              ),
            ]
          : []),
      ]);
    }
    return wouldRefuse(a.result) || wouldRefuse(b.result) ? EXIT_REFUSED : EXIT_OK;
  },
};
