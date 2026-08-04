import {
  simulatePackageRules,
  type SimulationResult,
  type TraceResult,
} from "@renovate-config-debugger/engine";
import { outputFormat } from "../args";
import type { Command } from "../command";
import { CliError, EXIT_OK, EXIT_REFUSED } from "../io";
import { emitJson, emitLines, preview, writeNotes } from "../output";
import { INPUT_OPTIONS, runFromArgs, wouldRefuse } from "../run-input";
import { readDependency } from "../dep";

/**
 * "Would this PR be grouped/labeled/blocked here?" — every packageRule
 * evaluated against a hypothetical update, with clause-level evidence for why
 * each one did or didn't fire.
 */

export async function simulateAgainst(
  result: TraceResult,
  dep: Parameters<typeof simulatePackageRules>[0]["dep"],
): Promise<SimulationResult> {
  if (!result.finalConfig) {
    throw new CliError("nothing to simulate — the run produced no effective config");
  }
  return simulatePackageRules({ config: result.finalConfig, dep });
}

export function verdictLines(sim: SimulationResult): string[] {
  const lines: string[] = [];
  for (const rule of sim.rules) {
    const clauses = rule.clauses.map((c) => `${c.key}=${c.state}`).join(", ");
    lines.push(`  #${rule.index + 1} ${rule.verdict}${clauses ? ` (${clauses})` : ""}`);
    for (const merged of rule.merged ?? []) {
      lines.push(`      sets ${merged.key} = ${preview(merged.after)}`);
    }
    for (const note of rule.notes) {
      lines.push(`      note: ${note}`);
    }
  }
  return lines;
}

export const simulateCommand: Command = {
  name: "simulate",
  summary: "evaluate the packageRules against one hypothetical update",
  usage: [`simulate [file] --dep '{"depName":"react","currentValue":"17.0.0"}'`],
  details: [
    "`updateType` is derived from currentValue/newValue when you don't set",
    "it, exactly as a real lookup would before the rules run.",
  ],
  options: [...INPUT_OPTIONS, "dep", "dep-file", "format", "help"],
  async run(args, io) {
    const format = outputFormat(args);
    const dep = await readDependency(args, "dep", "dep-file");
    const { result, notes } = await runFromArgs(args, io);
    writeNotes(io, notes);
    const sim = await simulateAgainst(result, dep);
    const matched = sim.rules.filter((r) => r.verdict === "matched");

    if (format === "json") {
      emitJson(io, { dep, ...sim });
    } else {
      // Deliberately NOT the whole `finalDependencyConfig`: it is the
      // effective config with every Renovate default in it, which buries the
      // answer. What the rules DID is the delta they merged; `--format json`
      // carries the full document for anyone who wants it.
      const changes = sim.mergeSteps.flatMap((step) =>
        step.merged.map(
          (m) =>
            `  ${m.key} = ${preview(m.after)}` +
            (step.kind === "flatten"
              ? `  (${step.updateType} block)`
              : `  (rule #${(step.ruleIndex ?? 0) + 1})`),
        ),
      );
      emitLines(io, [
        `${matched.length} of ${sim.rules.length} packageRules matched.`,
        "",
        ...verdictLines(sim),
        "",
        ...(changes.length > 0
          ? ["The rules changed these options for this dependency:", ...changes]
          : ["No rule changed anything for this dependency."]),
        "",
        "`--format json` adds the clause-level evidence and the full per-dependency config.",
        ...(sim.notes.length > 0 ? ["", "Notes:", ...sim.notes.map((n) => `  ${n}`)] : []),
      ]);
    }
    return wouldRefuse(result) ? EXIT_REFUSED : EXIT_OK;
  },
};
