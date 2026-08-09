import { compareSimulations, type SimulationComparison } from "@renovate-config-debugger/engine";
import { outputFormat, stringOption } from "../args";
import type { Command } from "../command";
import { EXIT_OK, EXIT_REFUSED } from "../io";
import { emitJson, emitLines, preview, writeNotes } from "../output";
import { INPUT_OPTIONS, refusalNote, runOne, takeInputFile, wouldRefuse } from "../run-input";
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

/**
 * Roadmap 062: the headline states the BEHAVIOR verdict, and says so in the
 * words a reader can cite. The identity fact (a rule's pattern text moved) is
 * reported underneath, because for the commonest behavior-preserving edit —
 * dropping an entry from the very array a rule matches on — it is guaranteed
 * to be true and means nothing on its own.
 */
export function comparisonHeadline(comparison: SimulationComparison): string {
  if (!comparison.noChange) {
    return "Behavior differs between A and B.";
  }
  if (comparison.rulesChanged) {
    return (
      "✓ No behavioral change — the resulting config is identical and every rule still does " +
      "what it did (a rule's pattern text changed, which is expected when you edit the array " +
      "the rule matches on)."
    );
  }
  return "✓ No behavioral change: the same rules matched and the resulting config is identical.";
}

export const compareCommand: Command = {
  name: "compare",
  summary: "A/B two simulations: prove an edit changed (or didn't change) behavior",
  usage: [
    `compare <before.json> <after.json> --dep '{"depName":"react"}'`,
    `compare <file> --dep '{…}' --dep-b '{…}'`,
  ],
  details: [
    "The verdict has two axes. BEHAVIOR (`noChange`) is the citable claim: the",
    "resulting per-dependency config is identical and no rule started or stopped",
    "doing something. IDENTITY (`rulesChanged`, `signatureChanges`) only says a",
    "selector's text moved — unavoidable when the edit is to the matched array",
    "itself, and not a behavior change on its own.",
  ],
  options: [...INPUT_OPTIONS, "dep", "dep-file", "dep-b", "dep-b-file", "format"],
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

    const refusedA = wouldRefuse(a.result);
    const refusedB = wouldRefuse(b.result);
    const refusal = refusalNote([
      ...(refusedA ? ["config A"] : []),
      ...(refusedB && b.result !== a.result ? ["config B"] : []),
    ]);

    if (format === "json") {
      emitJson(io, {
        a: { config: file ?? "(stdin/repo)", dep: depA, wouldRefuse: refusedA },
        b: { config: fileB ?? file ?? "(stdin/repo)", dep: depB, wouldRefuse: refusedB },
        ...comparison,
        ...(refusal ? { exitNote: refusal } : {}),
      });
    } else {
      emitLines(io, [
        comparisonHeadline(comparison),
        ...(comparison.behaviorOnlyInA.length > 0
          ? ["", "Matched only in A:", ...comparison.behaviorOnlyInA.map((r) => `  ${r.label}`)]
          : []),
        ...(comparison.behaviorOnlyInB.length > 0
          ? ["", "Matched only in B:", ...comparison.behaviorOnlyInB.map((r) => `  ${r.label}`)]
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
        ...(comparison.signatureChanges.length > 0
          ? [
              "",
              "Selector text changed, same effect (rule identity, not behavior):",
              ...comparison.signatureChanges.map(
                (c) => `  ${c.a.label}  #${c.a.index + 1} → #${c.b.index + 1}`,
              ),
            ]
          : []),
        ...(refusal ? ["", refusal] : []),
      ]);
    }
    return refusedA || refusedB ? EXIT_REFUSED : EXIT_OK;
  },
};
