import {
  type RuleEvaluation,
  simulatePackageRules,
  type SimulationResult,
  type TraceResult,
} from "@renovate-config-debugger/engine";
import { outputFormat, stringOption } from "../args";
import type { Command } from "../command";
import { CliError, EXIT_OK, EXIT_REFUSED } from "../io";
import { emitJson, emitLines, writeNotes } from "../output";
import { INPUT_OPTIONS, refusalNote, runFromArgs, wouldRefuse } from "../run-input";
import { readDependency } from "../dep";
import {
  buildRuleView,
  hiddenRulesNote,
  ruleFilterPayload,
  ruleFilterSelection,
} from "../rule-view";
import { collapseDiffs, mergedLine, parseConfigScope, parseKeys } from "../projections/config-view";
import { collapseRuleMerges, parseDetail, simulationPayload } from "../projections/simulate";

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

export function verdictLines(rules: readonly RuleEvaluation[]): string[] {
  const lines: string[] = [];
  for (const rule of rules) {
    const clauses = rule.clauses.map((c) => `${c.key}=${c.state}`).join(", ");
    lines.push(`  #${rule.index + 1} ${rule.verdict}${clauses ? ` (${clauses})` : ""}`);
    for (const merged of collapseDiffs(rule.merged ?? [])) {
      lines.push(`      sets ${mergedLine(merged)}`);
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
    "it, exactly as a real lookup would before the rules run — and `packageName`",
    "defaults to `depName`, the way Renovate's fetch worker fills it in.",
    "",
    "A `config:best-practices` config resolves to hundreds of rules, so pretty",
    "output prints the notable ones (matched + unresolved) and says how many it",
    "hid. `--verdict`/`--source` scope it; `--format json` keeps the full array",
    "unless you pass one of them.",
    "",
    "`--format json` answers at `--detail verdict`: the merge trace",
    "(`mergeSteps`, `rawFinalConfig`) is ~1 MB on a `config:recommended` run and",
    "is opt-in through `--detail full`, which returns the whole simulation",
    "result unprojected. `finalDependencyConfig` is reported at",
    "`--config-scope package-rules` — the globalOnly options no rule can read",
    "are dropped — and `--keys a,b` narrows it to the options you asked about.",
  ],
  options: [
    ...INPUT_OPTIONS,
    "dep",
    "dep-file",
    "verdict",
    "source",
    "detail",
    "keys",
    "config-scope",
    "format",
  ],
  async run(args, io) {
    const format = outputFormat(args);
    const selection = ruleFilterSelection(args, format);
    const detail = parseDetail(stringOption(args, "detail")) ?? "verdict";
    const keys = parseKeys(stringOption(args, "keys"));
    const scope = parseConfigScope(stringOption(args, "config-scope"), "--config-scope");
    const dep = await readDependency(args, "dep", "dep-file");
    const { result, notes } = await runFromArgs(args, io);
    writeNotes(io, notes);
    const sim = await simulateAgainst(result, dep);
    const view = buildRuleView(sim, result, selection);
    writeNotes(io, view.notes);
    const matched = sim.rules.filter((r) => r.verdict === "matched");
    const refused = wouldRefuse(result);
    const refusal = refusalNote(refused ? ["the config"] : []);

    if (format === "json") {
      emitJson(io, {
        dep,
        ...simulationPayload(sim, {
          detail,
          scope: scope ?? "package-rules",
          ...(keys ? { keys } : {}),
        }),
        rules: detail === "full" ? view.rules : collapseRuleMerges(view.rules),
        ...(selection.explicit ? ruleFilterPayload(view) : {}),
        wouldRefuse: refused,
        ...(refusal ? { exitNote: refusal } : {}),
      });
    } else {
      // Deliberately NOT the whole `finalDependencyConfig`: it is the
      // effective config with every Renovate default in it, which buries the
      // answer. What the rules DID is the delta they merged; `--format json`
      // carries the full document for anyone who wants it.
      const changes = sim.mergeSteps.flatMap((step) =>
        collapseDiffs(step.merged).map(
          (m) =>
            `  ${mergedLine(m)}` +
            (step.kind === "flatten"
              ? `  (${step.updateType} block)`
              : `  (rule #${(step.ruleIndex ?? 0) + 1})`),
        ),
      );
      const hiddenNote = hiddenRulesNote(view);
      emitLines(io, [
        `${matched.length} of ${sim.rules.length} packageRules matched.`,
        "",
        ...verdictLines(view.rules),
        ...(hiddenNote ? [hiddenNote] : []),
        "",
        ...(changes.length > 0
          ? ["The rules changed these options for this dependency:", ...changes]
          : ["No rule changed anything for this dependency."]),
        "",
        "`--format json` adds the clause-level evidence and the full per-dependency config.",
        ...(sim.notes.length > 0 ? ["", "Notes:", ...sim.notes.map((n) => `  ${n}`)] : []),
        ...(refusal ? ["", refusal] : []),
      ]);
    }
    return refused ? EXIT_REFUSED : EXIT_OK;
  },
};
